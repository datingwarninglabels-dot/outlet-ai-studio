import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Alert, Button } from "@/components/ui";
import { verifyResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set a new password — Outlet AI Studio", robots: { index: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const { token } = await searchParams;
  const userId = token ? await verifyResetToken(token) : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-accent">Outlet AI Studio</p>
        <h1 className="mt-1 text-2xl font-semibold">Set a new password</h1>
      </div>
      {userId ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">
            This reset link is invalid or has expired. Reset links last one hour and can be used once.
          </Alert>
          <Button href="/forgot-password" fullWidth>
            Request a new link
          </Button>
        </div>
      )}
    </main>
  );
}
