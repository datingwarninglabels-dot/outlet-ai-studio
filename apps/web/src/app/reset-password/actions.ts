"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeResetToken } from "@/lib/password-reset";
import { resetPasswordSchema } from "@/lib/validation";

export type ResetPasswordState = { status: "idle" | "done" | "error"; message: string };

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const userId = await consumeResetToken(parsed.data.token);
  if (!userId) {
    return {
      status: "error",
      message: "This reset link is invalid or has expired. Request a new one from the forgot-password page.",
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  return { status: "done", message: "Your password has been updated. You can sign in now." };
}
