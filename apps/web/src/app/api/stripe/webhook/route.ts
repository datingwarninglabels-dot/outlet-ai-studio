import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { stripeWebhookEvents, subscriptions } from "@/db/schema";
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
 *
 * `eventCreatedAt` is the wrapping Stripe *event's* `created` timestamp
 * (unix seconds), not read from `subscription` itself — Stripe explicitly
 * documents at-least-once, NOT necessarily ordered, webhook delivery. Before
 * writing, this compares against the target row's own
 * `lastStripeEventCreatedAt`; an incoming event no newer than what's already
 * applied is stale (delivered out of order) and is skipped rather than
 * overwriting newer state with older state — e.g. an "active" event queued
 * before a cancellation, delivered after it.
 */
async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription, eventCreatedAt: number): Promise<void> {
  const ownerId = await resolveOwnerId(subscription);
  if (!ownerId) {
    console.error(
      `[stripe webhook] could not resolve an owner for subscription ${subscription.id} (customer ${String(subscription.customer)}) — skipping.`,
    );
    return;
  }

  const eventCreatedAtDate = new Date(eventCreatedAt * 1000);

  const [existingRow] = await db
    .select({ lastStripeEventCreatedAt: subscriptions.lastStripeEventCreatedAt })
    .from(subscriptions)
    .where(eq(subscriptions.ownerId, ownerId))
    .limit(1);
  if (existingRow?.lastStripeEventCreatedAt && existingRow.lastStripeEventCreatedAt >= eventCreatedAtDate) {
    console.warn(
      `[stripe webhook] ignoring stale/out-of-order event for subscription ${subscription.id} (owner ${ownerId}) — ` +
        `event created ${eventCreatedAtDate.toISOString()}, already applied one from ${existingRow.lastStripeEventCreatedAt.toISOString()}.`,
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
    lastStripeEventCreatedAt: eventCreatedAtDate,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.ownerId, set: values });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventCreatedAt: number): Promise<void> {
  const ownerId = await resolveOwnerId(subscription);
  if (!ownerId) {
    console.error(`[stripe webhook] could not resolve an owner for deleted subscription ${subscription.id} — skipping.`);
    return;
  }

  const eventCreatedAtDate = new Date(eventCreatedAt * 1000);

  // Same staleness guard as upsertSubscriptionFromStripe — see its comment.
  const [existingRow] = await db
    .select({ lastStripeEventCreatedAt: subscriptions.lastStripeEventCreatedAt })
    .from(subscriptions)
    .where(eq(subscriptions.ownerId, ownerId))
    .limit(1);
  if (existingRow?.lastStripeEventCreatedAt && existingRow.lastStripeEventCreatedAt >= eventCreatedAtDate) {
    console.warn(
      `[stripe webhook] ignoring stale/out-of-order deletion event for subscription ${subscription.id} (owner ${ownerId}).`,
    );
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
      lastStripeEventCreatedAt: eventCreatedAtDate,
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

  // Stripe's delivery guarantee is at-least-once, not exactly-once — a slow
  // 200, a network blip, or a manual resend from the Dashboard can all
  // redeliver the same event id. Checked BEFORE doing any state-changing
  // work, but only recorded as done AFTER the switch below succeeds (see
  // the bottom of this function) — recording it up front would mean a
  // request that fails partway (returns 500 so Stripe retries) gets
  // wrongly treated as "already handled" on the retry, silently dropping a
  // real subscription-state change instead of ever actually applying it.
  const [alreadyProcessed] = await db
    .select({ id: stripeWebhookEvents.id })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.id, event.id))
    .limit(1);
  if (alreadyProcessed) {
    console.warn(`[stripe webhook] duplicate delivery of event ${event.id} (${event.type}) — already processed, skipping.`);
    return NextResponse.json({ received: true, duplicate: true });
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
        await upsertSubscriptionFromStripe(subscription, event.created);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscriptionFromStripe(event.data.object, event.created);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object, event.created);
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
    // silently drop a subscription state change. Deliberately NOT recorded
    // as processed below, so the retry actually reprocesses it.
    return NextResponse.json({ error: "Internal error handling webhook." }, { status: 500 });
  }

  // Only recorded once the switch above has actually succeeded — see the
  // comment at the top of this function for why recording it earlier would
  // be wrong. onConflictDoNothing rather than a plain insert: two
  // deliveries of the same event racing past the check above and both
  // reaching here is a harmless, extremely unlikely edge case (every
  // handler above is itself an idempotent upsert of the same final state),
  // not one worth failing the response over.
  try {
    await db.insert(stripeWebhookEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  } catch (err) {
    // The actual subscription state change above already succeeded — never
    // turn that into a 500 (and a needless Stripe retry) over failing to
    // record this bookkeeping marker. Worst case, a future redelivery gets
    // reprocessed instead of skipped, which is safe for the same reason.
    console.error(`[stripe webhook] failed to record processed event id ${event.id}`, err);
  }

  return NextResponse.json({ received: true });
}
