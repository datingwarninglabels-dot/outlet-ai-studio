import { openBillingPortal } from "./actions";

// No client JS needed — a Server Action bound directly to a form's action
// works without "use client" or useActionState, since there's no local
// state to manage (openBillingPortal always redirects or no-ops).
export function ManageSubscriptionButton({ disabled }: { disabled: boolean }) {
  if (disabled) {
    return (
      <p className="text-sm text-muted">
        You&apos;re on the Free plan — there&apos;s no subscription to manage yet.
      </p>
    );
  }

  return (
    <form action={openBillingPortal}>
      <button
        type="submit"
        className="h-11 w-fit rounded-lg border border-border px-5 text-sm font-medium hover:bg-surface-raised"
      >
        Manage subscription
      </button>
    </form>
  );
}
