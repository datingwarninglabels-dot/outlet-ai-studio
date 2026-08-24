import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm text-accent-teal">Outlet AI Studio</p>
        <h1 className="mt-1 text-2xl font-semibold">Set up your Owner account</h1>
        <p className="mt-2 text-sm text-muted">
          This app has one private Owner. This screen only works once — after your account is
          created it redirects to sign-in.
        </p>
      </div>
      <SetupForm />
    </main>
  );
}
