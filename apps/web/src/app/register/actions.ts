"use server";

import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { registerSchema } from "@/lib/validation";

export type RegisterResult = { error: string | null };

// Same cheap bot defense as the waitlist form (marketing)/actions.ts —
// no IP rate-limiting/CAPTCHA here, that's a separate, later "cost/abuse
// controls" milestone, not part of open self-service registration.
const MIN_SUBMIT_MS = 1500;

export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
  website: string;
  renderedAt: number;
}): Promise<RegisterResult> {
  if (input.renderedAt && Date.now() - input.renderedAt < MIN_SUBMIT_MS) {
    return { error: "Something went wrong. Please try again." };
  }

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check your name, email, and password (12+ characters)." };
  }

  if (parsed.data.website) {
    // Honeypot tripped — same generic failure, no hint given to the bot.
    return { error: "Something went wrong. Please try again." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "customer",
    });
  } catch (err) {
    // 23505 = Postgres unique_violation — the only expected failure mode
    // for this insert (users.email is unique). Anything else (a real
    // connection/DB failure) gets a generic message instead of being
    // mislabeled as "email taken."
    const isDuplicateEmail =
      typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
    if (isDuplicateEmail) {
      return { error: "An account with that email already exists." };
    }
    console.error("[register] account creation failed", err);
    return { error: "Something went wrong. Please try again." };
  }

  return { error: null };
}
