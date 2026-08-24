"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setupSchema } from "@/lib/validation";

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

  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    role: "owner",
  });

  redirect("/login");
}
