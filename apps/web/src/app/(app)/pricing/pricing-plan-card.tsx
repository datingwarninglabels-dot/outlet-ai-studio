"use client";

import { useActionState } from "react";
import type { Plan } from "@/lib/plans";
import { startCheckout, type BillingActionState } from "../billing/actions";

const initialState: BillingActionState = { error: "" };

export function PricingPlanCard({
  plan,
  priceDisplay,
  isCurrentPlan,
}: {
  plan: Plan;
  priceDisplay: string;
  isCurrentPlan: boolean;
}) {
  const [state, formAction, pending] = useActionState(startCheckout, initialState);

  return (
    <div
      className={`flex flex-col gap-5 rounded-2xl border p-6 ${
        plan.highlighted ? "border-accent bg-surface shadow-lg shadow-accent/10" : "border-border bg-surface"
      }`}
    >
      <div>
        {plan.highlighted && (
          <span className="mb-2 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            Recommended
          </span>
        )}
        <h3 className="text-xl font-semibold">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
      </div>

      <div>
        <p className="text-2xl font-bold">{priceDisplay}</p>
        <p className="mt-1 text-xs text-muted">{plan.creditsNote}</p>
      </div>

      <ul className="flex flex-1 flex-col gap-2 text-sm text-muted">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {feature}
          </li>
        ))}
      </ul>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      {isCurrentPlan ? (
        <div className="flex h-11 items-center justify-center rounded-lg border border-border text-sm text-muted">
          Current plan
        </div>
      ) : plan.stripePriceEnvVar ? (
        <form action={formAction}>
          <input type="hidden" name="plan" value={plan.id} />
          <button
            type="submit"
            disabled={pending}
            className={`flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
              plan.highlighted
                ? "bg-accent text-accent-foreground hover:bg-accent-strong"
                : "border border-border hover:bg-surface-raised"
            }`}
          >
            {pending ? "Redirecting..." : `Choose ${plan.name}`}
          </button>
        </form>
      ) : (
        <div className="flex h-11 items-center justify-center rounded-lg border border-border text-sm text-muted">
          No checkout needed
        </div>
      )}
    </div>
  );
}
