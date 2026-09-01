import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sanitizeCallbackUrl } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: rawCallbackUrl } = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl);

  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl);
  }

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    redirect("/setup");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm text-accent-teal">Outlet AI Studio</p>
        <h1 className="mt-1 text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Your idea. Your voice. Your outlet.</p>
      </div>
      <LoginForm callbackUrl={callbackUrl} />
    </main>
  );
}
