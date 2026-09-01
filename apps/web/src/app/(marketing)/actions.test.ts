import { beforeEach, describe, expect, it, vi } from "vitest";

// The real `db` and `next/headers` both require things this unit-test
// environment doesn't have (a live Postgres connection, an actual request
// context) — mocked here so joinWaitlist's own branching logic (rate
// limiting, duplicate handling, error recovery) can be verified without a
// database. Live-database submission behavior is NOT covered by these
// tests — see PLAN.md's landing-page milestone entry for that gap.
const selectWhereMock = vi.fn();
const insertValuesMock = vi.fn();
const insertOnConflictMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: selectWhereMock,
      })),
    })),
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
  },
}));

const headersGetMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

const { joinWaitlist } = await import("./actions");

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const fields = {
    email: "Creator@Example.com",
    consent: "on",
    website: "",
    creatorType: "",
    renderedAt: String(Date.now() - 5000),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

const idle = { status: "idle" as const, message: "" };

beforeEach(() => {
  vi.clearAllMocks();
  headersGetMock.mockImplementation((name: string) => (name === "x-forwarded-for" ? "203.0.113.5" : null));
  selectWhereMock.mockResolvedValue([{ count: 0 }]);
  insertValuesMock.mockReturnValue({ onConflictDoNothing: insertOnConflictMock });
  insertOnConflictMock.mockResolvedValue(undefined);
});

describe("joinWaitlist — validation and bot rejection (no DB call reached)", () => {
  it("rejects an invalid email without touching the database", async () => {
    const result = await joinWaitlist(idle, makeFormData({ email: "not-an-email" }));
    expect(result.status).toBe("error");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects missing consent with a specific message", async () => {
    const result = await joinWaitlist(idle, makeFormData({ consent: "" }));
    expect(result.status).toBe("error");
    expect(result.message.toLowerCase()).toContain("consent");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a filled honeypot field without touching the database", async () => {
    const result = await joinWaitlist(idle, makeFormData({ website: "http://spam.example" }));
    expect(result.status).toBe("error");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a submission faster than the minimum human-plausible time", async () => {
    const result = await joinWaitlist(idle, makeFormData({ renderedAt: String(Date.now() - 100) }));
    expect(result.status).toBe("error");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("joinWaitlist — rate limiting", () => {
  it("rejects submission when the IP has hit the rate limit window", async () => {
    selectWhereMock.mockResolvedValue([{ count: 3 }]);
    const result = await joinWaitlist(idle, makeFormData());
    expect(result.status).toBe("error");
    expect(result.message.toLowerCase()).toContain("too many attempts");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("allows submission when under the rate limit", async () => {
    selectWhereMock.mockResolvedValue([{ count: 2 }]);
    const result = await joinWaitlist(idle, makeFormData());
    expect(result.status).toBe("success");
  });

  it("skips the rate-limit check entirely when no IP header is present (never blocks a real signup over it)", async () => {
    headersGetMock.mockReturnValue(null);
    const result = await joinWaitlist(idle, makeFormData());
    expect(result.status).toBe("success");
    expect(selectWhereMock).not.toHaveBeenCalled();
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ ipHash: null }));
  });
});

describe("joinWaitlist — success path and email normalization", () => {
  it("returns a success state and lowercases the stored email", async () => {
    const result = await joinWaitlist(idle, makeFormData({ email: "Creator@Example.COM" }));
    expect(result.status).toBe("success");
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ email: "creator@example.com" }));
  });

  it("stores a null creatorType when none was selected", async () => {
    await joinWaitlist(idle, makeFormData({ creatorType: "" }));
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ creatorType: null }));
  });

  it("a repeat signup (onConflictDoNothing) still returns the same success message, not an error", async () => {
    // onConflictDoNothing resolves normally whether or not a row was
    // actually inserted — from the visitor's side, they're on the list
    // either way, so this must never surface as a failure.
    insertOnConflictMock.mockResolvedValue(undefined);
    const result = await joinWaitlist(idle, makeFormData());
    expect(result.status).toBe("success");
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("joinWaitlist — database failure recovery", () => {
  it("returns a clear error state (not an unhandled rejection) when the rate-limit query fails", async () => {
    selectWhereMock.mockRejectedValue(new Error("connection refused"));
    await expect(joinWaitlist(idle, makeFormData())).resolves.toEqual(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("returns a clear error state (not an unhandled rejection) when the insert fails", async () => {
    insertOnConflictMock.mockRejectedValue(new Error("connection refused"));
    await expect(joinWaitlist(idle, makeFormData())).resolves.toEqual(
      expect.objectContaining({ status: "error" }),
    );
  });
});
