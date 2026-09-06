"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, hashRateLimitKey } from "@/lib/rate-limit";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation";

type ActionState = { error: string };

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You're signed out. Reload and sign in again." };

  const parsed = updateProfileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid name." };
  }

  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, session.user.id));
  revalidatePath("/settings");
  return { error: "" };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You're signed out. Reload and sign in again." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // Same brute-force ceiling as the login path, keyed per account.
  const allowed = await checkRateLimit({
    scope: "password-change",
    key: hashRateLimitKey(session.user.id),
    windowMinutes: 10,
    maxAttempts: 5,
  });
  if (!allowed) return { error: "Too many attempts. Try again in a few minutes." };

  const [account] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!account?.passwordHash) {
    return { error: "This account signs in with Google — there's no password to change." };
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, account.passwordHash);
  if (!valid) return { error: "Your current password is incorrect." };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, session.user.id));
  return { error: "" };
}

export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You're signed out. Reload and sign in again." };

  // The single Owner is the platform operator — deleting it would leave the
  // app bootstrap-able by anyone. Not a self-serve action.
  if (session.user.role === "owner") {
    return { error: "The Owner account can't be deleted from here." };
  }

  const [account] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const confirmation = String(formData.get("confirmEmail") ?? "").trim();
  if (!account || confirmation.toLowerCase() !== (account.email ?? "").toLowerCase()) {
    return { error: "Type your account email exactly to confirm." };
  }

  // Every owned row (projects, media, characters, worlds, brand kit,
  // subscriptions, …) is FK-bound with onDelete: "cascade".
  await db.delete(users).where(eq(users.id, session.user.id));
  await signOut({ redirectTo: "/" });
  return { error: "" };
}
