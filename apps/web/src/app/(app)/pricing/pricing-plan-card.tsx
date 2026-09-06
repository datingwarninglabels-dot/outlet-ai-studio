"use client";

import { useActionState } from "react";
import { Alert, Badge, Button } from "@/components/ui";
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
          <Badge tone="accent" className="mb-2">
            Recommended
          </Badge>
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
            <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {feature}
          </li>
        ))}
      </ul>

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      {isCurrentPlan ? (
        <div className="flex h-11 items-center justify-center rounded-lg border border-border text-sm text-muted">
          Current plan
        </div>
      ) : plan.stripePriceEnvVar ? (
        <form action={formAction}>
          <input type="hidden" name="plan" value={plan.id} />
          <Button
            type="submit"
            variant={plan.highlighted ? "primary" : "secondary"}
            fullWidth
            pending={pending}
            pendingLabel="Redirecting…"
          >
            Choose {plan.name}
          </Button>
        </form>
      ) : (
        <div className="flex h-11 items-center justify-center rounded-lg border border-border text-sm text-muted">
          No checkout needed
        </div>
      )}
    </div>
  );
}
