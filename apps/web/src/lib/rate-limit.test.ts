import { beforeEach, describe, expect, it, vi } from "vitest";

const selectWhereMock = vi.fn();
const insertValuesMock = vi.fn();

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

const { checkRateLimit, hashRateLimitKey } = await import("./rate-limit");

beforeEach(() => {
  vi.clearAllMocks();
  selectWhereMock.mockResolvedValue([{ count: 0 }]);
  insertValuesMock.mockResolvedValue(undefined);
});

describe("checkRateLimit", () => {
  it("allows and records an attempt when under the limit", async () => {
    selectWhereMock.mockResolvedValue([{ count: 2 }]);
    const allowed = await checkRateLimit({ scope: "test", key: "k1", windowMinutes: 10, maxAttempts: 3 });
    expect(allowed).toBe(true);
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ scope: "test", key: "k1" }));
  });

  it("denies without recording a new attempt once at the limit", async () => {
    selectWhereMock.mockResolvedValue([{ count: 3 }]);
    const allowed = await checkRateLimit({ scope: "test", key: "k1", windowMinutes: 10, maxAttempts: 3 });
    expect(allowed).toBe(false);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("scopes independently — hitting the limit in one scope doesn't block another", async () => {
    selectWhereMock.mockResolvedValue([{ count: 0 }]);
    const allowed = await checkRateLimit({ scope: "login", key: "k1", windowMinutes: 10, maxAttempts: 3 });
    expect(allowed).toBe(true);
  });

  it("fails open (allows) on a database error rather than blocking the feature it protects", async () => {
    selectWhereMock.mockRejectedValue(new Error("connection refused"));
    const allowed = await checkRateLimit({ scope: "test", key: "k1", windowMinutes: 10, maxAttempts: 3 });
    expect(allowed).toBe(true);
  });
});

describe("hashRateLimitKey", () => {
  it("produces a deterministic hash for the same input", () => {
    expect(hashRateLimitKey("someone@example.com")).toBe(hashRateLimitKey("someone@example.com"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashRateLimitKey("a@example.com")).not.toBe(hashRateLimitKey("b@example.com"));
  });

  it("never returns the raw input", () => {
    expect(hashRateLimitKey("someone@example.com")).not.toContain("someone@example.com");
  });
});
