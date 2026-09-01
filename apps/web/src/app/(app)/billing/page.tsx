import Link from "next/link";
import { auth } from "@/auth";
import { getEntitlement } from "@/lib/entitlements";
import { getPlan } from "@/lib/plans";
import { ManageSubscriptionButton } from "./manage-subscription-button";

export const dynamic = "force-dynamic";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    return null; // (app)/layout.tsx already redirects to /login before this renders.
  }

  const { checkout, error } = await searchParams;
  const entitlement = await getEntitlement(session.user.id);
  const plan = getPlan(entitlement.plan);
  const usagePercent =
    entitlement.monthlyCreditCents > 0
      ? Math.min(100, Math.round((entitlement.usedCreditCentsThisCycle / entitlement.monthlyCreditCents) * 100))
      : 0;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted">Your plan, usage, and subscription.</p>
      </div>

      {checkout === "success" && (
        <p role="status" className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm text-accent">
          Checkout complete. It can take a few seconds for your plan to update here.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          Checkout was cancelled — you haven&apos;t been charged.
        </p>
      )}
      {error === "no-customer" && (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-400">
          You don&apos;t have a billing account yet — subscribe to a paid plan first.
        </p>
      )}
      {error === "portal-failed" && (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-400">
          Couldn&apos;t open the billing portal. Please try again.
        </p>
      )}
      {error === "not-configured" && (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-400">
          Billing isn&apos;t connected yet.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Current plan</p>
            <p className="text-lg font-semibold">{plan.name}</p>
          </div>
          {entitlement.status && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs uppercase tracking-wide text-muted">
              {entitlement.status}
              {entitlement.cancelAtPeriodEnd ? " · cancels at period end" : ""}
            </span>
          )}
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Usage this cycle</span>
            <span>
              {formatCents(entitlement.usedCreditCentsThisCycle)} / {formatCents(entitlement.monthlyCreditCents)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${usagePercent}%` }}
              role="progressbar"
              aria-valuenow={usagePercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Resets {formatDate(entitlement.periodEnd)}
            {entitlement.remainingCreditCents <= 0 && " — you're out of credits until then, or upgrade below"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Manage your subscription</h2>
          <Link href="/pricing" className="text-sm text-accent hover:underline">
            {entitlement.plan === "free" ? "Upgrade" : "Change plan"}
          </Link>
        </div>
        <p className="text-sm text-muted">
          Update your payment method, view invoices, or cancel your subscription through Stripe&apos;s secure billing
          portal.
        </p>
        <ManageSubscriptionButton disabled={entitlement.plan === "free"} />
      </section>
    </div>
  );
}
