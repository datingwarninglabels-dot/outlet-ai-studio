"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { createResetToken } from "@/lib/password-reset";
import { checkRateLimit, hashRateLimitKey } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site-config";
import { forgotPasswordSchema } from "@/lib/validation";

export type ForgotPasswordState = { status: "idle" | "sent" | "error"; message: string };

// Always the same response whether or not an account exists — no account
// enumeration through this endpoint.
const SENT_MESSAGE = "If an account exists for that email, a reset link is on its way. It expires in one hour.";

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter a valid email." };
  }

  const email = parsed.data.email.toLowerCase();
  const allowed = await checkRateLimit({
    scope: "password-reset-request",
    key: hashRateLimitKey(email),
    windowMinutes: 15,
    maxAttempts: 5,
  });
  if (!allowed) {
    return { status: "error", message: "Too many requests. Try again in a few minutes." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Only credential accounts have a password to reset; Google-only accounts
  // silently get the same "sent" response with nothing sent.
  if (user?.passwordHash) {
    try {
      const token = await createResetToken(user.id);
      const resetUrl = `${SITE_URL}/reset-password?token=${token}`;
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      console.error("[forgot-password] failed to issue reset", err);
      // Still return the neutral message — don't leak that the address exists.
    }
  }

  return { status: "sent", message: SENT_MESSAGE };
}
