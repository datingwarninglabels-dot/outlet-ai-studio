import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password — Outlet AI Studio", robots: { index: false } };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-accent">Outlet AI Studio</p>
        <h1 className="mt-1 text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-muted">
          Enter your account email and we&apos;ll send a link to set a new password.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <a href="/login" className="text-accent hover:underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
