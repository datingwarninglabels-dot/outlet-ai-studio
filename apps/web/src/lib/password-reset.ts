import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";

// Raw token lives only in the emailed link; the DB stores its hash, so a
// leaked table can't be replayed. 32 bytes = 64 hex chars.
const TOKEN_BYTES = 32;
const TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a fresh reset token for a user and invalidates any earlier
 * unused ones (a new request supersedes an old link). Returns the raw
 * token to put in the emailed URL — it is never stored or logged here.
 */
export async function createResetToken(userId: string): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(now.getTime() + TTL_MS),
    });
  });

  return raw;
}

/** Returns the userId for a valid (unused, unexpired) token, else null. */
export async function verifyResetToken(raw: string): Promise<string | null> {
  if (!raw) return null;
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(raw)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Atomically marks the token used (and every other outstanding token for
 * that user) and returns the userId. Returns null if the token was
 * already invalid — callers must treat that as a failed reset.
 */
export async function consumeResetToken(raw: string): Promise<string | null> {
  if (!raw) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(raw)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) return null;

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));

    return row.userId;
  });
}
