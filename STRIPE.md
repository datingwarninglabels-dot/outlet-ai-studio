# Stripe billing — setup

Outlet AI Studio uses Stripe for subscription billing (Free / Pro / Studio).
This document lists exactly what needs to be configured for it to work.
Nothing here has been tested against a live Stripe account or a real
database in this environment — see "What's verified vs. not" at the end.

## Environment variables

All of these go in `apps/web/.env.local` (see `apps/web/.env.example`).
**None of them are ever sent to the browser** — Checkout and the Billing
Portal are both hosted, redirect-based Stripe flows created server-side, so
this app never needs a Stripe publishable key or any client-side Stripe.js.

| Variable | Required? | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes, for any billing feature to work | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) — use a test-mode key (`sk_test_...`) until ready for real payments |
| `STRIPE_WEBHOOK_SECRET` | Yes | The signing secret for the webhook endpoint you create at [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) (point it at `https://<your-domain>/api/stripe/webhook`), or from `stripe listen` for local development |
| `STRIPE_PRICE_ID_PRO` | Yes, for the Pro plan to be purchasable | Create a recurring **monthly** Price under a Product in Stripe, then copy its Price ID (`price_...`) |
| `STRIPE_PRICE_ID_STUDIO` | Yes, for the Studio plan to be purchasable | Same as above, for the Studio plan |
| `FREE_PLAN_MONTHLY_CREDIT_CENTS` | No (has a development-only fallback) | A real business decision — see "Credits" below |
| `PRO_PLAN_MONTHLY_CREDIT_CENTS` | No (has a development-only fallback) | Same |
| `STUDIO_PLAN_MONTHLY_CREDIT_CENTS` | No (has a development-only fallback) | Same |

The Free plan has no Stripe Price ID — there's nothing to check out for it.

## Events the webhook handles

`POST /api/stripe/webhook` (`apps/web/src/app/api/stripe/webhook/route.ts`)
verifies the request's signature against `STRIPE_WEBHOOK_SECRET` before
doing anything else, then handles:

- `checkout.session.completed` — links the completed Checkout's subscription to the internal user (via the Checkout Session's `client_reference_id`/metadata, set when the session was created)
- `customer.subscription.created` / `customer.subscription.updated` — writes the current plan, status, and billing period to the `subscription` table
- `customer.subscription.deleted` — resets the account to the Free plan

Configure your webhook endpoint in the Stripe Dashboard (or `stripe
listen --forward-to localhost:3000/api/stripe/webhook` locally) to send at
least these events. Sending more events than this list is harmless — anything
not explicitly handled is ignored.

**Failed/expired payments are not a separate event to configure.** Stripe's
own retry schedule moves a subscription's `status` to `past_due` and
eventually `unpaid`/`canceled` if every retry fails — all of which already
fire `customer.subscription.updated`. Access is authorized by checking that
status (see "How access is enforced" below), not by listening for
`invoice.payment_failed` separately.

## Credits

A credit is defined as **one cent of real provider cost**, using the same
cost-estimation functions (`apps/web/src/lib/cost-estimate.ts`) already used
to show a cost estimate before every generation — not an independently
invented conversion rate. This means there's no "how many credits does an
image cost" number to configure separately; it's whatever that generation
actually costs, in cents.

What *is* a real, unresolved business decision is **how many credits each
plan gets per month** — `FREE_PLAN_MONTHLY_CREDIT_CENTS`,
`PRO_PLAN_MONTHLY_CREDIT_CENTS`, and `STUDIO_PLAN_MONTHLY_CREDIT_CENTS`. The
app runs with small, clearly-arbitrary development-only fallbacks
(100 / 2000 / 6000 cents) if these are unset, so nothing crashes, but a
production deploy should set real, decided values.

Credits reset every billing cycle (calendar month for Free, the
subscription's own billing period for Pro/Studio) — unused credits do not
roll over.

## How access is enforced

`apps/web/src/lib/entitlements.ts`'s `getEntitlement(ownerId)` is the single
source of truth for what an account can currently do. It:

1. Reads the account's `subscription` row (or treats a missing row as
   Free).
2. Checks Stripe's own `status` field — only `"active"` or `"trialing"`
   count as paid access. A `plan` column that still says `"pro"`/`"studio"`
   next to a `"canceled"`/`"past_due"`/`"unpaid"` status is **not** treated
   as paid access. This is what makes "immediate downgrade on cancellation
   or failed payment" actually true: the moment Stripe reports a
   non-active status, access drops, without needing a separate downgrade
   step.
3. Sums actual (or estimated, if not yet known) cost for every *confirmed*
   generation since the current billing period started.

Every generation type funnels through one function,
`requestJob()` (`apps/web/src/lib/jobs.ts`), which calls
`requireCredits()` before creating any job — this is where the paywall is
actually enforced, server-side, regardless of which page or form triggered
the request. The client never decides this; it only reacts to
`PaywallError`'s message by rendering the `<Paywall />` component instead of
a plain error.

**Whether Stripe cancels a subscription immediately or at the end of the
billing period when someone cancels from the Billing Portal is a Stripe
Dashboard setting**, not something this app's code controls — see
Settings → Billing → Customer Portal → Cancellation in the Stripe
Dashboard. Either way, the moment Stripe actually reports a non-active
status, this app's access check reflects that immediately.

## What's verified vs. not

- `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` all
  pass with this code in place (see the implementation summary for exact
  results).
- **Not verified**: an actual Stripe test-mode Checkout completing, a real
  webhook delivery, or any of this against a live database — no reachable
  database or real Stripe account exists in the environment this was built
  in (the same limitation noted throughout this project's `PLAN.md` for
  every prior milestone). Before relying on this in production: run a real
  test-mode Checkout end to end, confirm the webhook actually updates the
  `subscription` row, and confirm a canceled/failed subscription actually
  loses access.
