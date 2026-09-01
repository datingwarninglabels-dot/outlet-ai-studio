"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getPlan, type PlanId } from "@/lib/plans";
import { SITE_URL } from "@/lib/site-config";
import { AlreadySubscribedError, createBillingPortalSession, createCheckoutSession, isStripeConfigured } from "@/lib/stripe";

export type BillingActionState = { error: string };

/**
 * Starts a Checkout Session and redirects there — never trusts anything
 * from the client beyond which plan was clicked. The actual entitlement
 * only ever changes once Stripe's webhook confirms payment (see
 * api/stripe/webhook/route.ts); this action doesn't grant anything itself.
 *
 * Checkout (mode: "subscription") always creates a BRAND NEW Stripe
 * subscription — it never modifies an existing one. createCheckoutSession
 * refuses (throwing AlreadySubscribedError) for an owner who already has
 * active/trialing paid access, specifically to prevent ending up with two
 * separate subscriptions on the same Stripe customer, both billing, with
 * this app's `subscription` row (one per owner) only ever able to reflect
 * whichever webhook landed last — the other would keep charging, silently,
 * forever. That case is routed to the Billing Portal instead, which
 * updates the EXISTING subscription's price (requires "Update subscription"
 * enabled under Settings → Billing → Customer portal in the Stripe
 * Dashboard — see STRIPE.md).
 */
export async function startCheckout(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!isStripeConfigured()) {
    return { error: "Billing isn't connected yet — add STRIPE_SECRET_KEY to your environment and restart the app." };
  }

  const planId = String(formData.get("plan") ?? "") as PlanId;
  let plan;
  try {
    plan = getPlan(planId);
  } catch {
    return { error: "Unknown plan." };
  }
  if (!plan.stripePriceEnvVar) {
    return { error: "The Free plan doesn't require checkout." };
  }
  if (!process.env[plan.stripePriceEnvVar]) {
    return { error: `${plan.stripePriceEnvVar} is not set — this plan isn't ready for checkout yet.` };
  }

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutSession({
      ownerId: session.user.id,
      email: session.user.email ?? "",
      plan,
      successUrl: `${SITE_URL}/billing?checkout=success`,
      cancelUrl: `${SITE_URL}/billing?checkout=cancelled`,
    });
  } catch (err) {
    if (err instanceof AlreadySubscribedError) {
      // openBillingPortal() redirects on its own (including its
      // no-customer-yet edge case, which shouldn't be reachable here since
      // AlreadySubscribedError only throws when a subscription row already
      // exists), so its throw propagates exactly like the redirect below.
      await openBillingPortal();
      return { error: "" }; // unreachable — kept explicit, see redirect()'s never-return note elsewhere in this file
    }
    console.error("[billing] failed to create checkout session", err);
    return { error: "Something went wrong starting checkout. Please try again." };
  }

  // Outside the try/catch deliberately — redirect() works by throwing, and
  // catching that here would misreport a successful redirect as a failure.
  redirect(checkoutUrl);
}

/** Sends the customer to Stripe's own hosted Billing Portal — manage
 * payment method, view invoices, cancel — rather than building custom UI
 * for any of that ourselves. */
export async function openBillingPortal(): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!isStripeConfigured()) {
    redirect("/billing?error=not-configured");
  }

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, session.user.id)).limit(1);
  if (!sub?.stripeCustomerId) {
    redirect("/billing?error=no-customer");
  }

  let portalUrl: string;
  try {
    portalUrl = await createBillingPortalSession({
      stripeCustomerId: sub.stripeCustomerId,
      returnUrl: `${SITE_URL}/billing`,
    });
  } catch (err) {
    console.error("[billing] failed to create billing portal session", err);
    redirect("/billing?error=portal-failed");
  }

  redirect(portalUrl);
}
