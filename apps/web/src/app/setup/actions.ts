"use server";

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setupSchema } from "@/lib/validation";

// Postgres advisory locks are keyed by an arbitrary bigint the caller
// picks — this one is just a constant unique to this app's bootstrap step.
const BOOTSTRAP_LOCK_KEY = BigInt(918273645);

export async function createOwner(formData: FormData): Promise<{ error: string } | never> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    redirect("/login");
  }

  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please check your name, email, and password (12+ characters)." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // The check above is just a fast path. Without a second check inside a
  // transaction-scoped advisory lock right before the insert, two
  // concurrent first-time submissions could both pass the check above and
  // both insert — creating a second Owner account. This app's entire
  // security model (every other ownership check in the codebase) assumes
  // exactly one ever exists, so this is enforced here, not left to luck.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
    const stillEmpty = await tx.select({ id: users.id }).from(users).limit(1);
    if (stillEmpty.length > 0) {
      return;
    }
    await tx.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "owner",
    });
  });

  redirect("/login");
}
