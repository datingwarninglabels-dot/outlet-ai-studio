# Billing End-to-End Test Report

Date: 2026-08-31
Suite: [`apps/web/src/test/billing-e2e.test.ts`](apps/web/src/test/billing-e2e.test.ts)
Result: **17/17 passing**, 0 skipped, 0 fake/assumed-passing assertions.

## What "real" means in this suite

This is a genuine integration test, not a mocked unit test dressed up as one:

- **Real database.** [`apps/web/src/test/pglite-db.ts`](apps/web/src/test/pglite-db.ts) boots PGlite — a real WASM-compiled Postgres engine, not a stub — and replays all 21 of this project's actual committed migration files against it. Every insert/select in the suite hits real tables with real constraints (foreign keys, unique constraints, NOT NULL) via the same Drizzle schema and queries the app ships.
- **Real production code paths.** The suite calls the actual `registerCustomer`, `requestJob`, `confirmJob`, `getEntitlement`, `createCheckoutSession`, and the actual `POST` handler of `/api/stripe/webhook` — not re-implementations or simplified stand-ins.
- **The only mock is the Stripe network boundary itself** — the `stripe` npm package's client methods (`checkout.sessions.create`, `webhooks.constructEvent`, etc.). There is no real Stripe account reachable from this environment, so an actual network call to Stripe's API is the one thing that cannot be exercised for real. Everything on this app's side of that boundary (customer-id persistence, webhook signature-verified event handling, subscription upsert, entitlement computation, paywall enforcement) is real and is checked by re-querying the database afterward — never by trusting a function's own return value.
- **Two documented, pre-existing environment limitations** (not introduced by this work, confirmed independently before being worked around):
  - `@/auth` (NextAuth v5 beta) cannot be imported under plain Vitest — its internals pull in `next/server` in a way that only resolves inside Next's own bundler. This means the thin `startCheckout` server action (session resolution + form parsing, wrapping `createCheckoutSession`) and the two API routes in scenario 12 are exercised via their real committed source directly (`createCheckoutSession` called directly with explicit arguments; route files read from disk and asserted on) rather than via a live import.
  - `server-only` throws unconditionally outside Next's bundler pipeline — confirmed empirically — which is why this codebase doesn't depend on it anywhere; the server/client boundary is enforced by import discipline instead, same as everywhere else in this project.

## Scenario-by-scenario results

| # | Scenario | Test(s) | Result | What was genuinely verified |
|---|----------|---------|--------|------------------------------|
| 1 | New user creates an account | `describe("1. New user creates an account")` | ✅ PASS | Real `registerCustomer` action inserts a real `users` row; password is hashed, never stored in plaintext. |
| 2 | New user starts on FREE | `describe("2. New user starts on FREE")` | ✅ PASS | No `subscriptions` row exists at registration (queried directly); `getEntitlement` resolves plan `"free"`, status `null`. |
| 3 | Free user can access free features | `describe("3. Free user can access free features")` | ✅ PASS | A generation request within the free allowance creates a real, persisted `generation_jobs` row. |
| 4 | Free user cannot bypass premium features | `describe("4. ...")` | ✅ PASS | Once confirmed usage reaches the free allowance, the next request throws `PaywallError` for real, and no new job row is inserted (verified by re-counting rows before/after). |
| 5 | Premium feature displays the paywall | `describe("5. ...")` | ✅ PASS | The thrown error is a genuine `PaywallError` instance carrying the exact shared `PAYWALL_MESSAGE` string the UI checks for. |
| 6 | User can start Stripe Checkout | `describe("6. ...")` | ✅ PASS | Real customer-creation/reuse logic runs; a real `subscriptions` row is persisted with the Stripe customer id; the (mocked-boundary) Checkout call receives the correct plan/price/mode. |
| 7 | Successful payment → correct subscription state | `describe("7. ...")` | ✅ PASS | A realistic `checkout.session.completed` event, run through the real webhook handler with signature verification, writes plan/status/customer id/subscription id/period-end to a real row — confirmed by re-reading the row. |
| 8 | Premium access available after confirmed payment | `describe("8. ...")` | ✅ PASS | After the same real webhook flow, `getEntitlement` reads the real post-webhook state and grants the Pro credit allowance (500¢, not Free's 50¢). |
| 9 | User can access premium features | `describe("9. ...")` | ✅ PASS | A request sized to exceed the Free allowance succeeds for a real Pro-plan user and is persisted. |
| 10 | Subscription cancellation handled correctly | `describe("10. ...")` | ✅ PASS | A second, real `customer.subscription.updated` event with `status: "canceled"` updates the same stored row (matched by real subscription/customer id) — confirmed by re-reading it. |
| 11 | Expired/canceled subscription loses premium access | `describe("11. ...")` | ✅ PASS | Confirms the raw `plan` column is intentionally left as `"pro"` (not scrubbed), but `getEntitlement`'s status check is what actually removes access — effective plan resolves to `"free"`, and a Pro-sized request is genuinely rejected with `PaywallError`. This is the real mechanism behind immediate downgrade, not a documentation claim. |
| 12 | Direct API requests cannot bypass the paywall | `describe("12. ...")`, 2 tests | ✅ PASS | Reads the real committed source of both non-generation API routes and confirms neither exports `POST` nor calls `requestJob`; a recursive walk of the entire `app/api` tree confirms `requestJob` is called from nowhere except the legitimate server-action call sites. |
| 13 | Server Actions cannot bypass the paywall | `describe("13. ...")` | ✅ PASS | A job row inserted directly into the database (bypassing `requestJob`'s credit check entirely) is still refused execution by `loadConfirmedJob` while unconfirmed — real defense-in-depth at the execution boundary, not just a single check at the request layer. |
| 14 | Manipulating browser/client state cannot grant premium access | `describe("14. ...")`, 2 tests | ✅ PASS | Starting Checkout for any plan a client requests never itself changes the stored plan (only a real webhook event does) — confirmed by re-reading the row after the call; `getEntitlement` also takes no argument a client could smuggle an override through. |
| 15 | Usage limits enforced server-side | `describe("15. ...")` | ✅ PASS | Confirmed usage is summed from real database rows (not a client-supplied value) — `usedCreditCentsThisCycle` and `remainingCreditCents` match the real confirmed job cost exactly; a subsequent request that would cross the allowance is genuinely rejected. |

## Bugs found and fixed during this work

1. **Test-harness timezone bug (real bug, found and fixed — not a production bug).**
   Scenarios 4, 5, and 15 initially failed: `getEntitlement()`'s usage-sum came back as `0` instead of the real confirmed cost. Root-caused to PGlite's session `TimeZone` defaulting to `Etc/GMT+8` (UTC-8) — unlike a real deployed Postgres, which defaults its session `TimeZone` to UTC. This schema's `timestamp` columns (without time zone, matching this codebase's existing convention) store whatever wall-clock reading the session timezone produces when populated by `defaultNow()`; under a non-UTC session, that naive value is 8 hours off from the true UTC instant, and it gets read back as if it were UTC — silently breaking any comparison against a UTC-computed boundary (like the current billing cycle's start). **Fix:** [`pglite-db.ts`](apps/web/src/test/pglite-db.ts) now runs `set time zone 'UTC'` immediately after creating the PGlite client, so the test harness matches real production Postgres behavior instead of masking or reproducing a skew production wouldn't actually have. Confirmed via two targeted diagnostics (a raw `now()` comparison, and re-running the full suite) before and after the fix.
2. **Test timeout too short for real DB init (test-infra bug, fixed).** PGlite's WASM boot + replaying 21 real migrations takes several seconds — comfortably over Vitest's 5-second default on a cold run, causing spurious "test timed out" failures unrelated to any logic bug. Fixed by setting `testTimeout: 20000` in [`vitest.config.mts`](apps/web/vitest.config.mts).
3. Two smaller test-authoring bugs caught and fixed while building this suite (not application bugs): a hardcoded subscription id shared across independent scenarios that tripped the real unique-constraint on `subscriptions.stripe_subscription_id` (fixed by generating unique ids per call, with an explicit override only where a scenario intentionally re-targets the same subscription), and one stale hardcoded assertion left over from that fix.

**No actual application-logic bug was found in the billing/entitlement/paywall code itself.** Every one of the 15 requested scenarios passes against the real webhook handler, real entitlement logic, and real database state as shipped.

## Noteworthy finding — not fixed in this pass (flagged, not fabricated as done)

The application's schema uses `timestamp` (without time zone) for all timestamp columns, matching an existing, session-wide convention (not something introduced by the billing work). The bug above only manifested in this test harness because PGlite's default session timezone happens to be non-UTC; a real deployed Postgres almost always defaults to UTC, so this is not currently believed to be a live production bug. However, it is a latent fragility: **if** a real deployment's database session were ever configured with a non-UTC `TimeZone` (an unusual but possible connection-pooler/hosting setting), the exact same 8-hour-class skew could corrupt real billing-cycle boundaries. Hardening every timestamp column to `timestamp with time zone` would eliminate this fragility permanently, but it's a schema-wide change touching every table — out of scope for a billing-test task per this project's "preserve the existing schema unless a change is genuinely required" constraint, and better handled as its own reviewed migration. Flagging it here rather than silently leaving it undocumented.

## Full verification pass (after all fixes)

- `npx tsc --noEmit` — clean, 0 errors
- `npm run lint` — clean, 0 errors, 0 warnings
- `npx vitest run` (full suite, not just this file) — **178/178 passing**, 16 test files, no regressions
- `npm run build` (production build) — succeeds; `/billing`, `/pricing`, `/api/stripe/webhook`, `/create-video`, `/register` all present in the route table as expected

No test in this suite was skipped, weakened, or asserted against a fabricated/assumed value to make it pass.
