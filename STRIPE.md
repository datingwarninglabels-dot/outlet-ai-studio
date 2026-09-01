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

**Idempotency and delivery-order protection.** Stripe's own delivery
guarantee is at-least-once, not exactly-once, and explicitly does not
guarantee events arrive in order. This handler defends against both:

- Every event id is recorded (`stripe_webhook_event` table) once it's been
  successfully handled; a redelivery of the same event id is detected and
  skipped before any state-changing work runs.
- Each `subscription` row tracks the `created` timestamp of the last event
  actually applied to it (`lastStripeEventCreatedAt`). An incoming event no
  newer than that is treated as stale/out-of-order and ignored — otherwise
  an older "active" event delivered after a newer "canceled" one could
  silently restore access after a legitimate cancellation.

## Changing plans for an already-subscribed customer

`createCheckoutSession` refuses (`AlreadySubscribedError`) to start a new
Checkout Session for an owner who already has real, active/trialing paid
access — Checkout always creates a **brand-new** subscription, never
modifies an existing one, so allowing it here would leave a customer with
two separate subscriptions on the same Stripe customer, both billing,
with only one ever reflected in this app's `subscription` row. That case
is routed to the Billing Portal instead (`billing/actions.ts`'s
`startCheckout` catches the error and redirects there).

**This means "Update subscription" must be enabled in the Stripe
Dashboard** (Settings → Billing → Customer portal → Products) for an
existing customer to actually be able to switch plans — without it, the
Portal will only offer payment-method/invoice management, not a plan
switcher. Enable it and select which Prices (Pro, Studio) a customer can
switch between before relying on in-app plan changes.

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

The credit check and the job/usage-cost rows it gates run inside one
database transaction, behind a per-owner Postgres advisory lock
(`pg_advisory_xact_lock`) — without this, two concurrent requests near the
credit ceiling (two tabs, a scripted burst) could each pass the check
before either commits, together exceeding the plan's allowance. Same
pattern this codebase already uses for the `/setup` bootstrap-account
race (see `setup/actions.ts`), just keyed per-owner instead of globally.

**Whether Stripe cancels a subscription immediately or at the end of the
billing period when someone cancels from the Billing Portal is a Stripe
Dashboard setting**, not something this app's code controls — see
Settings → Billing → Customer Portal → Cancellation in the Stripe
Dashboard. Either way, the moment Stripe actually reports a non-active
status, this app's access check reflects that immediately.

## What's verified vs. not

- `npx tsc --noEmit`, `npm run lint`, `npm test` (184 tests, including a
  real-database billing E2E suite — see `BILLING_E2E_TEST_REPORT.md`), and
  `npm run build` all pass with this code in place.
- The webhook's signature-verified event handling, entitlement computation,
  cancellation/expiry access loss, event dedup, and stale/out-of-order
  event rejection are all verified against a real database (PGlite) in
  `apps/web/src/test/billing-e2e.test.ts` and `route.test.ts`. Only the
  Stripe SDK's own network client is mocked — no real Stripe account is
  reachable in this environment.
- **Not independently verified: the per-owner advisory-lock fix for the
  credit-check race.** The fix itself (transaction + `pg_advisory_xact_lock`,
  same primitive and pattern as the existing `/setup` bootstrap-lock fix)
  is correct by construction, and the full suite still passes with it in
  place — but PGlite processes `db.transaction()` calls fully serially
  regardless of locking, so no automated test run here can actually
  demonstrate two requests interleaving the way they would against a real
  multi-connection Postgres. Confirmed this empirically (a probe transaction
  never overlaps a second one under PGlite) before choosing not to ship a
  concurrency test that would pass identically whether the fix worked or
  not.
- **Still not verified**: an actual Stripe test-mode Checkout completing, a
  real webhook delivery from Stripe itself, or the Billing Portal's
  "Update subscription" flow actually working end to end — no reachable
  live Stripe account exists in this environment. Before relying on this in
  production: run a real test-mode Checkout, confirm the webhook actually
  updates the `subscription` row, confirm a canceled/failed subscription
  actually loses access, and confirm an already-subscribed test customer is
  correctly routed to a working plan-switcher in the Billing Portal (after
  enabling "Update subscription" — see above).
