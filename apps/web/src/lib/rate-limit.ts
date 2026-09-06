import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitEvents } from "@/db/schema";

// Salted with AUTH_SECRET so a hash can't be reversed or correlated across
// deployments — this exists purely to rate-limit, never to identify anyone.
// Falls back to a fixed (non-secret) salt if AUTH_SECRET is somehow unset,
// but warns loudly rather than degrading silently — a production deploy
// missing AUTH_SECRET has bigger problems than this, and should know.
export function hashRateLimitKey(raw: string): string {
  let salt = process.env.AUTH_SECRET;
  if (!salt) {
    console.warn(
      "[rate-limit] AUTH_SECRET is not set — falling back to a non-secret salt. Set AUTH_SECRET before production use.",
    );
    salt = "outlet-ai-studio-insecure-fallback-salt";
  }
  return crypto.createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

/**
 * Records one attempt and reports whether it's within the allowed rate.
 * Fails OPEN (returns true) on a database error — a rate limiter that can
 * take down the feature it's protecting on a transient DB hiccup is worse
 * than one that occasionally under-limits.
 */
export async function checkRateLimit(params: {
  scope: string;
  key: string;
  windowMinutes: number;
  maxAttempts: number;
}): Promise<boolean> {
  const { scope, key, windowMinutes, maxAttempts } = params;
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimitEvents)
      .where(and(eq(rateLimitEvents.scope, scope), eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, windowStart)));

    if (count >= maxAttempts) {
      return false;
    }

    await db.insert(rateLimitEvents).values({ scope, key });
    return true;
  } catch (err) {
    console.error(`[rate-limit] check failed for scope "${scope}" — failing open`, err);
    return true;
  }
}
