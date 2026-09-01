import Link from "next/link";

/**
 * Shown wherever a user hits their plan's credit limit — either reactively
 * (a generation action's error matched lib/entitlements.ts's
 * PAYWALL_MESSAGE) or proactively (a page checked getEntitlement() ahead
 * of time and remainingCreditCents is 0). Never decides access itself —
 * it's purely the UI response to a server-side decision that already
 * happened.
 */
export function Paywall({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft text-center ${compact ? "p-4" : "p-8"}`}
    >
      <p className="text-sm font-medium text-accent">You&apos;ve used all your credits for this cycle</p>
      <p className="max-w-sm text-sm text-muted">
        Upgrade your plan for a larger monthly credit allowance, or wait for your credits to reset next billing
        cycle.
      </p>
      <Link
        href="/pricing"
        className="mt-1 flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-strong"
      >
        View plans
      </Link>
    </div>
  );
}
