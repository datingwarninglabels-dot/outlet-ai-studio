import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { getEntitlement } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { getPlanPriceDisplay } from "@/lib/stripe";
import { PricingPlanCard } from "./pricing-plan-card";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await auth();
  if (!session?.user) {
    return null; // (app)/layout.tsx already redirects to /login before this renders.
  }

  const entitlement = await getEntitlement(session.user.id);
  const priceDisplays = await Promise.all(PLANS.map((plan) => getPlanPriceDisplay(plan)));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Plans"
        description="Every plan is credit-based — no unlimited-generation claim. Credit costs are shown before you confirm a generation."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <PricingPlanCard
            key={plan.id}
            plan={plan}
            priceDisplay={priceDisplays[i]}
            isCurrentPlan={entitlement.plan === plan.id}
          />
        ))}
      </div>
    </div>
  );
}
