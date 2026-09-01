"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm text-accent-teal">Outlet AI Studio</p>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        An unexpected error occurred. You can try again, or head back to your dashboard.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="h-11 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-5 text-sm font-medium text-black"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="flex h-11 items-center rounded-lg border border-border px-5 text-sm text-muted hover:bg-surface-raised hover:text-foreground"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
