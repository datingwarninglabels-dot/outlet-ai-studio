// Central plan configuration — the pricing page, the marketing landing
// page's pricing section, and the billing page all read every field from
// here rather than hardcoding copy or numbers. This is also where Stripe
// Price IDs map to internal plan ids (stripePriceEnvVar), and where
// lib/entitlements.ts's credit allowances are documented as living
// (env-configured, not here — see that file).
//
// priceLabel stays "Coming soon" until a real price is approved and set in
// Stripe — see lib/stripe.ts's getPlanPriceDisplay(), which fetches the
// actual price directly from Stripe (by Price ID) when one is configured,
// rather than ever hardcoding a dollar figure here. Free has no Stripe
// price at all (stripePriceEnvVar is null) — there's nothing to check out.
export type PlanId = "free" | "pro" | "studio";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Static fallback shown until Stripe has a real price to display — see
   * the file header. Never a specific figure invented here. */
  priceLabel: string;
  /** Qualitative, not a specific credit count — real allowances live in
   * lib/entitlements.ts's environment-configured PLAN_LIMITS. */
  creditsNote: string;
  /** Benefit-framed, and only things that exist today or are clearly
   * planned — never implies a feature is live if it isn't. */
  features: string[];
  highlighted: boolean;
  /** Name of the env var holding this plan's Stripe Price ID — null for
   * "free", which has no Stripe price at all. */
  stripePriceEnvVar: string | null;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try the full workflow before you subscribe.",
    priceLabel: "Free",
    creditsNote: "A small monthly credit allowance to explore every feature.",
    features: [
      "Script and scene breakdown",
      "AI voiceover generation",
      "Per-scene AI visuals and animation",
      "Thumbnail generation",
      "One character and one world in your library",
    ],
    highlighted: false,
    stripePriceEnvVar: null,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For creators getting their first ideas into finished videos.",
    priceLabel: "Coming soon",
    creditsNote: "A monthly credit allowance sized for regular short-form projects.",
    features: [
      "Everything in Free",
      "A larger monthly credit allowance",
      "Full content package export",
      "Priority access to new capabilities",
    ],
    highlighted: false,
    stripePriceEnvVar: "STRIPE_PRICE_ID_PRO",
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "For creators publishing consistently across formats.",
    priceLabel: "Coming soon",
    creditsNote: "The largest monthly credit allowance, for higher volume and longer projects.",
    features: [
      "Everything in Pro",
      "The largest monthly credit allowance",
      "Longer, long-form-ready projects",
      "A larger Character Library and World Library",
      "Continuity checking across scenes",
    ],
    highlighted: true,
    stripePriceEnvVar: "STRIPE_PRICE_ID_STUDIO",
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id "${id}".`);
  }
  return plan;
}
