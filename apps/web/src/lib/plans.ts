// Central plan configuration — the landing page's pricing section reads
// every field from here rather than hardcoding copy or numbers. This is
// also the file Phase 2's Stripe integration will extend (mapping each
// plan's `stripePriceEnvVar` to a real Price ID via env var) rather than a
// second, separately-maintained source of truth.
//
// No dollar figures or credit counts are hardcoded here yet — real pricing
// and credit allowances depend on measuring actual provider costs first
// (see PLAN.md's Phase 2 launch-checklist item on this). Showing an
// invented number now would be exactly the kind of claim the landing-page
// brief says not to make.
export type PlanId = "starter" | "creator";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Never a specific figure until pricing is approved — "Coming soon" /
   * "Early access" / etc. Swap this one field when that changes. */
  priceLabel: string;
  /** Qualitative, not a specific credit count — see file header. */
  creditsNote: string;
  /** Benefit-framed, and only things that exist today or are clearly
   * planned — never implies a feature is live if it isn't. */
  features: string[];
  highlighted: boolean;
  /** Name of the env var that will hold this plan's Stripe Price ID once
   * billing exists — not read from anywhere yet, just documents the
   * mapping point so it doesn't need inventing later. */
  stripePriceEnvVar: string;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For creators getting their first ideas into finished videos.",
    priceLabel: "Coming soon",
    creditsNote: "A monthly credit allowance sized for regular short-form projects.",
    features: [
      "Script and scene breakdown",
      "AI voiceover generation",
      "Per-scene AI visuals and animation",
      "Thumbnail generation",
      "One character and one world in your library",
      "Full content package export",
    ],
    highlighted: false,
    stripePriceEnvVar: "STRIPE_PRICE_ID_STARTER",
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "For creators publishing consistently across formats.",
    priceLabel: "Coming soon",
    creditsNote: "A larger monthly credit allowance for higher volume and longer projects.",
    features: [
      "Everything in Starter",
      "More monthly credits",
      "Longer, long-form-ready projects",
      "A larger Character Library and World Library",
      "Continuity checking across scenes",
      "Priority access to new capabilities",
    ],
    highlighted: true,
    stripePriceEnvVar: "STRIPE_PRICE_ID_CREATOR",
  },
];
