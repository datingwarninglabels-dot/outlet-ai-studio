import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sanitizeCallbackUrl } from "@/lib/safe-redirect";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
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

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm text-accent-teal">Outlet AI Studio</p>
        <h1 className="mt-1 text-2xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-muted">Your idea. Your voice. Your outlet.</p>
      </div>
      <RegisterForm callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <a href="/login" className="text-accent-teal hover:underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
