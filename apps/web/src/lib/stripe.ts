import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getEntitlement } from "@/lib/entitlements";
import { PLANS, type Plan, type PlanId } from "@/lib/plans";

/** Thrown by createCheckoutSession when the owner already has real, active
 * paid access — see that function's own comment for why. Callers (see
 * billing/actions.ts's startCheckout) catch this specifically to redirect
 * to the Billing Portal instead of surfacing it as a generic failure. */
export class AlreadySubscribedError extends Error {
  constructor() {
    super("You already have an active subscription — manage it from the Billing Portal instead of starting a new one.");
    this.name = "AlreadySubscribedError";
  }
}

// No `server-only` guard package here — it throws unconditionally outside
// Next's own build pipeline (including under Vitest), which would make
// this module untestable. Same convention as the rest of this codebase
// (lib/jobs.ts, lib/authz.ts, db/index.ts): the secret key stays out of
// the browser because this module is only ever imported from "use server"
// actions, Route Handlers, and Server Components — never from a "use
// client" file. No publishable key is needed anywhere in this app either
// way: Checkout and the Billing Portal are both hosted, redirect-based
// flows created server-side, so there's no client-side Stripe.js/Elements
// usage at all.
let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

/** Reverse-maps a Stripe Price ID back to our internal plan id — used by
 * the webhook handler, which only has Stripe's own objects to work from. */
export function getPlanIdForStripePriceId(stripePriceId: string): PlanId | null {
  for (const plan of PLANS) {
    if (plan.stripePriceEnvVar && process.env[plan.stripePriceEnvVar] === stripePriceId) {
      return plan.id;
    }
  }
  return null;
}

function priceIdForPlan(plan: Plan): string {
  if (!plan.stripePriceEnvVar) {
    throw new Error(`Plan "${plan.id}" has no Stripe price — it can't be checked out.`);
  }
  const priceId = process.env[plan.stripePriceEnvVar];
  if (!priceId) {
    throw new Error(
      `${plan.stripePriceEnvVar} is not set — add the real Stripe Price ID for the "${plan.name}" plan to your environment.`,
    );
  }
  return priceId;
}

/**
 * Real price, fetched directly from Stripe by Price ID — never a
 * hardcoded dollar figure in this codebase. Falls back to the plan's
 * static priceLabel ("Coming soon") on any failure: Stripe not
 * configured, the env var unset, the Price ID invalid, or a network
 * error. Must never throw — this is called while rendering pricing UI.
 */
export async function getPlanPriceDisplay(plan: Plan): Promise<string> {
  if (!plan.stripePriceEnvVar || !isStripeConfigured()) {
    return plan.priceLabel;
  }
  const priceId = process.env[plan.stripePriceEnvVar];
  if (!priceId) {
    return plan.priceLabel;
  }
  try {
    const price = await getStripeClient().prices.retrieve(priceId);
    if (price.unit_amount == null) {
      return plan.priceLabel;
    }
    const amount = (price.unit_amount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
    });
    const interval = price.recurring?.interval;
    return interval ? `${amount}/${interval === "month" ? "mo" : interval}` : amount;
  } catch (err) {
    console.error(`[stripe] failed to fetch price for plan "${plan.id}"`, err);
    return plan.priceLabel;
  }
}

/** Finds this owner's existing Stripe customer, or creates one and records
 * it — a customer is created lazily, the first time someone actually
 * starts a Checkout, not speculatively at signup. */
export async function getOrCreateStripeCustomerId(ownerId: string, email: string): Promise<string> {
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, ownerId)).limit(1);
  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const customer = await getStripeClient().customers.create({
    email,
    metadata: { ownerId },
  });

  if (existing) {
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.ownerId, ownerId));
  } else {
    await db.insert(subscriptions).values({ ownerId, stripeCustomerId: customer.id, plan: "free" });
  }

  return customer.id;
}

/**
 * Creates a Checkout Session for a NEW subscription. Checkout
 * (mode: "subscription") always creates a brand-new Stripe subscription —
 * it can never modify/upgrade an existing one. Calling this for an owner
 * who already has real, active paid access (see getEntitlement — "free"
 * unless Stripe's own status is active/trialing) would, if completed,
 * leave the customer with TWO separate subscriptions on the same Stripe
 * customer, both billing every month: this app's `subscription` row (one
 * per owner, upserted by ownerId) can only ever reflect whichever
 * webhook landed last, so the other subscription would keep charging,
 * silently, forever, invisible in this app. Refusing up front —
 * AlreadySubscribedError — is what closes that gap; see
 * billing/actions.ts's startCheckout for where it's caught and redirected
 * to the Billing Portal (which updates the EXISTING subscription) instead.
 */
export async function createCheckoutSession(input: {
  ownerId: string;
  email: string;
  plan: Plan;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const entitlement = await getEntitlement(input.ownerId);
  if (entitlement.plan !== "free") {
    throw new AlreadySubscribedError();
  }

  const priceId = priceIdForPlan(input.plan);
  const customerId = await getOrCreateStripeCustomerId(input.ownerId, input.email);

  const session = await getStripeClient().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Belt-and-suspenders alongside `customer`: the webhook resolves the
    // owner from the Checkout Session's own metadata/client_reference_id
    // rather than only trusting a customer-id lookup, so a customer
    // created out-of-band (or a data mismatch) can't silently misattribute
    // a subscription to the wrong account.
    client_reference_id: input.ownerId,
    subscription_data: { metadata: { ownerId: input.ownerId } },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }
  return session.url;
}

export async function createBillingPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<string> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: input.stripeCustomerId,
    return_url: input.returnUrl,
  });
  return session.url;
}
