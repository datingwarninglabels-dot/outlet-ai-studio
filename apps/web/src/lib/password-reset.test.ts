import { createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { passwordResetTokens, users } from "@/db/schema";
import { createTestDb } from "@/test/pglite-db";

const { db, client } = await createTestDb();
vi.mock("@/db", () => ({ db }));

const { createResetToken, verifyResetToken, consumeResetToken } = await import("./password-reset");

afterAll(async () => {
  await client.close();
});

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email, passwordHash: "x", role: "customer" }).returning();
  return u.id;
}

describe("password reset tokens", () => {
  it("issues a token that verifies and then can be consumed exactly once", async () => {
    const userId = await makeUser("a@example.com");
    const token = await createResetToken(userId);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyResetToken(token)).toBe(userId);

    expect(await consumeResetToken(token)).toBe(userId);
    // second use fails
    expect(await consumeResetToken(token)).toBeNull();
    expect(await verifyResetToken(token)).toBeNull();
  });

  it("only stores the token hash, never the raw token", async () => {
    const userId = await makeUser("b@example.com");
    const token = await createResetToken(userId);
    const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    const active = rows.find((r) => r.usedAt === null)!;
    expect(active.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(active.tokenHash).not.toBe(token);
  });

  it("issuing a new token invalidates the previous unused one", async () => {
    const userId = await makeUser("c@example.com");
    const first = await createResetToken(userId);
    const second = await createResetToken(userId);
    expect(await verifyResetToken(first)).toBeNull();
    expect(await verifyResetToken(second)).toBe(userId);
  });

  it("rejects an expired token", async () => {
    const userId = await makeUser("d@example.com");
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: createHash("sha256").update("expired-raw").digest("hex"),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await verifyResetToken("expired-raw")).toBeNull();
    expect(await consumeResetToken("expired-raw")).toBeNull();
  });

  it("rejects an unknown token", async () => {
    expect(await verifyResetToken("nope")).toBeNull();
    expect(await consumeResetToken("")).toBeNull();
  });
});
