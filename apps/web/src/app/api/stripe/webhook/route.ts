import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getPlanIdForStripePriceId, getStripeClient, isStripeConfigured } from "@/lib/stripe";

// Stripe calls this directly — no session cookie, no CSRF token, nothing
// this app's normal auth machinery understands. The webhook signature
// (verified below against STRIPE_WEBHOOK_SECRET) IS the authentication for
// this route; see auth.config.ts's publicPaths, which excludes this path
// from the login-redirect check for exactly this reason.
export const dynamic = "force-dynamic";

/**
 * Resolves which of our users a Stripe subscription belongs to.
 * Priority: the subscription's own metadata (set at Checkout time via
 * subscription_data.metadata — the most direct link, survives even if a
 * customer is ever re-created or re-linked), falling back to matching our
 * stored stripeCustomerId. Returns null if neither resolves — should not
 * happen given every Checkout session this app creates sets the metadata,
 * but a webhook handler must never assume its own past code never had a
 * bug.
 */
async function resolveOwnerId(subscription: Stripe.Subscription): Promise<string | null> {
  const metadataOwnerId = subscription.metadata?.ownerId;
  if (metadataOwnerId) {
    return metadataOwnerId;
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) {
    return null;
  }
  const [existing] = await db
    .select({ ownerId: subscriptions.ownerId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  return existing?.ownerId ?? null;
}

/**
 * The single place subscription state gets written from a Stripe event —
 * used by both checkout.session.completed (after fetching the full
 * Subscription object) and customer.subscription.created/updated, so the
 * two code paths can't drift out of sync with each other.
 *
 * status is stored verbatim from Stripe rather than translated into a
 * parallel vocabulary. Access authorization (lib/entitlements.ts) checks
 * status, not just plan — so a subscription that lapses (past_due, unpaid,
 * canceled) loses paid access immediately the next time anything checks
 * entitlement, without this function needing to separately "downgrade"
 * anything. Whether Stripe cancels immediately or at period end is a
 * Customer Portal dashboard setting, not something this code controls —
 * see STRIPE.md.
 */
async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const ownerId = await resolveOwnerId(subscription);
  if (!ownerId) {
    console.error(
      `[stripe webhook] could not resolve an owner for subscription ${subscription.id} (customer ${String(subscription.customer)}) — skipping.`,
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const planId = priceId ? getPlanIdForStripePriceId(priceId) : null;
  const item = subscription.items.data[0];

  const values = {
    ownerId,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    // Falls back to "free" only if the Price ID isn't one we recognize
    // (e.g. STRIPE_PRICE_ID_PRO/_STUDIO misconfigured) — never silently
    // grants a plan we can't actually identify.
    plan: planId ?? "free",
    status: subscription.status,
    currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.ownerId, set: values });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const ownerId = await resolveOwnerId(subscription);
  if (!ownerId) {
    console.error(`[stripe webhook] could not resolve an owner for deleted subscription ${subscription.id} — skipping.`);
    return;
  }
  // Fully deleted (not just canceled-at-period-end pending) — reset plan
  // to free outright rather than leaving a stale plan id next to a
  // "canceled" status; getEntitlement() would compute the same effective
  // access either way, but this keeps the stored row unambiguous.
  await db
    .update(subscriptions)
    .set({
      plan: "free",
      status: subscription.status,
      cancelAtPeriodEnd: false,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.ownerId, ownerId));
}

export async function POST(request: Request): Promise<Response> {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Loud, specific failure rather than a generic 500 — an unconfigured
    // webhook endpoint that returns 200 would make Stripe think delivery
    // succeeded while nothing happened.
    console.error("[stripe webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  // Raw bytes, not request.json() — signature verification is computed
  // over the exact raw body Stripe sent; parsing and re-serializing it
  // first would invalidate the signature.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) {
          break;
        }
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        await upsertSubscriptionFromStripe(subscription);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscriptionFromStripe(event.data.object);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object);
        break;
      }
      // invoice.payment_failed isn't handled separately — Stripe's own
      // retry schedule moves the subscription's status to "past_due" (and
      // eventually "unpaid"/"canceled" if every retry fails), which always
      // fires customer.subscription.updated too. Handling that one event
      // type already covers "failed/expired" access loss without
      // duplicating the same upsert logic for two events that report the
      // same underlying state change.
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] failed to handle event ${event.type} (${event.id})`, err);
    // 500 so Stripe retries delivery — a transient DB error here shouldn't
    // silently drop a subscription state change.
    return NextResponse.json({ error: "Internal error handling webhook." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
