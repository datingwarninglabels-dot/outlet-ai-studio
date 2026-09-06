"use client";

import { Button } from "@/components/ui";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium text-accent">Outlet AI Studio</p>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        An unexpected error occurred. You can try again, or head back to your dashboard.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button href="/dashboard" variant="secondary">
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
