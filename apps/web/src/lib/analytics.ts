// Optional analytics adapter — inactive by default. No provider is wired
// in (none has been approved), and no client-side tracking script is
// loaded anywhere on the page. `track()` is safe to call from anywhere;
// today it does nothing in production and logs to the console in dev, so
// call sites are ready for a real provider without needing to be found and
// wired up later. Never pass anything here that isn't already meant to be
// public — no private prompts, generated media, form contents, or payment
// details, per the landing-page brief's privacy requirement.
export type AnalyticsEvent =
  | { name: "cta_click"; location: string }
  | { name: "pricing_view" }
  | { name: "waitlist_success" }
  | { name: "waitlist_error" }
  | { name: "registration_start" }
  | { name: "checkout_start" };

export function track(event: AnalyticsEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics:noop]", event);
  }
  // A real provider call goes here once one is approved — see this file's
  // header comment. Nothing else in the app should call a tracking script
  // directly; route everything through track() so swapping providers stays
  // a one-file change.
}
