"use client";

import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred loading this page. You can try again, or head back to your dashboard.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button href="/dashboard" variant="secondary">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
