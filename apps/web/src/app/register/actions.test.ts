import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked for the same reason as (marketing)/actions.test.ts's joinWaitlist
// tests — no live database in this environment. Live-database signup
// behavior is NOT covered here; see PLAN.md's Milestone 2 entry.
const insertValuesMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValuesMock })),
  },
}));

const { registerCustomer } = await import("./actions");

const validInput = {
  name: "Creator",
  email: "Creator@Example.COM",
  password: "twelvecharss",
  website: "",
  renderedAt: Date.now() - 5000,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertValuesMock.mockResolvedValue(undefined);
});

describe("registerCustomer — validation and bot rejection (no DB call reached)", () => {
  it("rejects an invalid email without touching the database", async () => {
    const result = await registerCustomer({ ...validInput, email: "not-an-email" });
    expect(result.error).not.toBeNull();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a password under 12 characters", async () => {
    const result = await registerCustomer({ ...validInput, password: "short" });
    expect(result.error).not.toBeNull();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a filled honeypot field without touching the database", async () => {
    const result = await registerCustomer({ ...validInput, website: "http://spam.example" });
    expect(result.error).not.toBeNull();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a submission faster than the minimum human-plausible time", async () => {
    const result = await registerCustomer({ ...validInput, renderedAt: Date.now() - 100 });
    expect(result.error).not.toBeNull();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("registerCustomer — success path", () => {
  it("creates the account with role 'customer' and a lowercased-by-DB-normalization email as given", async () => {
    const result = await registerCustomer(validInput);
    expect(result.error).toBeNull();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "Creator@Example.COM", role: "customer" }),
    );
  });

  it("never stores the plaintext password", async () => {
    await registerCustomer(validInput);
    const inserted = insertValuesMock.mock.calls[0][0];
    expect(inserted.passwordHash).toBeDefined();
    expect(inserted.passwordHash).not.toBe(validInput.password);
    expect(inserted).not.toHaveProperty("password");
  });
});

describe("registerCustomer — duplicate email and database failure", () => {
  it("returns a friendly message on a unique-constraint violation (23505), not a generic error", async () => {
    insertValuesMock.mockRejectedValue({ code: "23505" });
    const result = await registerCustomer(validInput);
    expect(result.error).toMatch(/already exists/i);
  });

  it("returns a generic error state (not an unhandled rejection) on any other database failure", async () => {
    insertValuesMock.mockRejectedValue(new Error("connection refused"));
    await expect(registerCustomer(validInput)).resolves.toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
