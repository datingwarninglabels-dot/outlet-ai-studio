import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    redirect("/setup");
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
