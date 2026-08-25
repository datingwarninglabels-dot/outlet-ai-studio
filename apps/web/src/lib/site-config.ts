// Central, typed configuration for the public marketing page — the single
// place that decides what CTAs say and do, and what contact/URL info is
// truthfully available. Nothing here is duplicated inside page components;
// they all read from this file.

/**
 * "waitlist": no registration or billing exists yet — CTAs collect an email
 *   via the waitlist form.
 * "early-access": a gated signup exists (e.g. invite codes) but full public
 *   registration doesn't yet — not used until that flow is real.
 * "registration": public account creation works, but billing/Checkout
 *   doesn't yet — CTAs link to a real signup flow.
 * "live": registration AND Checkout both work — CTAs go straight to it.
 * Flipping this one value changes every CTA on the page at once, per the
 * brief's requirement. Only "waitlist" is true today — see PLAN.md's Phase 2
 * milestone list for what has to ship before any other mode is honest.
 */
export type CtaMode = "waitlist" | "early-access" | "registration" | "live";

export const CTA_MODE: CtaMode = "waitlist";

export const CTA_LABELS: Record<CtaMode, string> = {
  waitlist: "Join the Waitlist",
  "early-access": "Get Early Access",
  registration: "Create your account",
  live: "Start Creating",
};

export const PRIMARY_CTA_LABEL = CTA_LABELS[CTA_MODE];
export const SECONDARY_CTA_LABEL = "See How It Works";

/**
 * Where the primary CTA actually goes, kept in lockstep with CTA_MODE so a
 * button's label and destination can never drift out of sync with each
 * other. "waitlist"/"early-access" both point at the on-page form (there's
 * no separate route for either yet); "registration"/"live" point at routes
 * that don't exist yet either — CTA_MODE must not be switched to those
 * until the routes behind them are real, per the brief's explicit
 * instruction not to link a button to something that doesn't work.
 */
export function primaryCtaHref(): string {
  switch (CTA_MODE) {
    case "waitlist":
    case "early-access":
      return "#waitlist";
    case "registration":
      return "/register";
    case "live":
      return "/register";
  }
}

// Canonical/base URL for metadata, Open Graph tags, and the sitemap — set
// SITE_URL once a real domain exists. Defaults to localhost so nothing
// breaks in dev before that happens.
export const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

if (process.env.NODE_ENV === "production" && !process.env.SITE_URL) {
  // Doesn't throw — falling back to localhost keeps the app running, but a
  // production deploy pointing canonical URLs/OG tags/sitemap at localhost
  // is a real misconfiguration a deploy should surface loudly, not silently
  // ship.
  console.warn(
    "[site-config] SITE_URL is not set in production — canonical URLs, Open Graph tags, and the sitemap will incorrectly point at http://localhost:3000. Set SITE_URL to the real production domain.",
  );
}

// null (unset) means "don't show a support contact yet" — never render a
// fabricated address. Set SUPPORT_EMAIL once there's a real inbox behind it.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || null;

// Empty until real URLs exist — the brief is explicit: omit social icons
// entirely rather than show nonfunctional ones. Shape is ready for whenever
// they're provided.
export const SOCIAL_LINKS: { label: string; href: string }[] = [];

// A function, not a computed constant — this module is only imported once
// per server process, so a plain `const CURRENT_YEAR = new Date()...` would
// freeze at whatever year the server happened to start in.
export function currentYear(): number {
  return new Date().getFullYear();
}
