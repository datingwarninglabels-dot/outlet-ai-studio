# Outlet AI Studio — Complete Project Summary

*Consolidated 2026-09-01. This is the single-file history of everything built, tested, audited, and
verified on this project across both Phase 1 (feature build) and Phase 2 (turning it into a paid
product). Detailed source documents this summary draws from are listed at the very end — this file
is the map, not a replacement for them.*

---

## What Outlet AI Studio is

**"Your idea. Your voice. Your outlet."** A web app that turns an idea or script into a complete
faceless-content package — script, scene breakdown, AI voiceover, per-scene visuals, animation, an
assembled final video, captions, and a thumbnail — for TikTok, YouTube Shorts, YouTube, Facebook
Reels, and Instagram Reels. Built milestone by milestone against a master prompt spec, with an
explicit house rule from day one: **nothing fakes success** — unbuilt or unverified pieces say so
instead of pretending to work.

**Stack**: Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4, Drizzle ORM + PostgreSQL,
Auth.js v5 (Credentials + Google), Trigger.dev (background job execution), Stripe (billing),
Cloudflare R2 or AWS S3 (private object storage). Provider integrations: Anthropic (script/
storyboard/vision), ElevenLabs (voice), Runway (image + image-to-video), Shotstack (final video
assembly).

---

## Phase 1 — the product itself (M0 through M6, all complete)

Started as a private, single-Owner tool (no public sign-up — that came in Phase 2). Built and
verified milestone by milestone:

| Milestone | What shipped |
|---|---|
| **M0** | App shell, single-Owner bootstrap (`/setup`, locks itself after first account), dashboard shell with all 11 spec nav sections. |
| **M1** | The full idea → video vertical slice: script generation (Anthropic), scene/storyboard breakdown, voice (ElevenLabs), per-scene visuals (Runway image), per-scene animation (Runway image-to-video), final video assembly (Shotstack), captions (SRT/VTT), and a `.zip` export package. Private object storage (R2/S3) stood up specifically because generated media must never be left at a temporary provider URL. |
| **M1.5** | Job resilience and cost control retrofitted across the whole pipeline: idempotency keys, resumable per-step job tracking, heartbeat-based stall detection, and a non-negotiable cost-confirmation gate before any billable provider call. |
| **M2** | Thumbnail Studio (style-variant thumbnails with editable headline text), Provider Hub (every provider's config/spend status in one place), and Character Library (reusable characters with locked appearance fields, reference-sheet generation, real-person permission gating). |
| **M3** | World Library (mirrors Character Library) plus the Continuity Checker — a vision-based Claude Sonnet call that compares a generated scene image against locked character/world details and flags mismatches, bundled into the same cost-gate as the visual generation it checks. |
| **M4** | Long-form resilience: removed the storyboard scene cap and added a truncation-tolerant JSON parser (unit-tested standalone before wiring in), made Shotstack assembly resumable on retry, verified (not assumed) that ElevenLabs' existing voice model doesn't need chunking at this app's scale. |
| **M5** | Brand Kit — logo/colors/fonts/watermark/default voice/default visual style, with real auto-apply-with-override behavior for visual style and voice selection (previously only a single global env-var voice existed). |
| **Media Library gap** | A unified browser over every generated/uploaded media asset, with direct upload support for file kinds the app couldn't previously ingest, and a 30-day trash window. |
| **M6** | Full unit test suite (74 tests), a dedicated security review (found and fixed a real Owner-bootstrap race condition and Media Library IDOR gaps), an accessibility sweep (touch targets to 44px app-wide), and PWA basics (manifest, service worker, offline banner, job-completion notifications). |

**Every named milestone on `PLAN.md` is complete.** Runtime verification was limited throughout
Phase 1 by a sandbox constraint (no reachable live database or network path from the dev environment
this was built in) — every milestone was verified via `tsc`/lint/build/unit-tests, with live
verification deferred until a real deployment. That gap is what Phase 2's billing E2E suite (below)
finally closed for the billing layer specifically, using a real embedded Postgres.

---

## Phase 2 — turning it into a paid, multi-tenant product

### Milestone 1 — background job architecture
Every generation job (9 types: script, storyboard, voice, visual, animation, assembly, thumbnail,
character/world images) moved off the synchronous request path and onto **Trigger.dev** tasks —
required because some jobs (multi-minute Shotstack renders, multi-scene Runway animation batches)
exceed serverless function time limits. No UI changes needed — the existing polling-based UI already
read the same `generation_jobs`/`job_steps` rows the tasks still write to; only *where* the work
executes changed.

### Milestone 2 — customer authentication
Open self-service registration (`/register`) alongside the existing single-Owner bootstrap.
`users.role` (owner/customer) wired into real JWT-based authorization gating Provider Hub to
Owner-only. Closed the one real ownership gap found (`media_asset` had no per-customer scoping;
Character/World Library and Brand Kit were already correctly scoped).

### Monetization — Stripe
Free / Pro / Studio plans, real Stripe Checkout + Billing Portal (both hosted, redirect-based — no
publishable key or client-side Stripe.js anywhere in this app), a webhook-driven `subscription`
table, and credit-based entitlements where **1 credit = 1¢ of real provider cost** (reusing the
existing cost-estimation tables rather than inventing a conversion rate). The paywall is enforced
entirely server-side inside `requestJob()` — never in a UI layer. `getEntitlement()` checks Stripe's
actual live `status` field, not just the stored `plan` column, which is what makes cancellation or a
failed payment revoke access immediately rather than needing a separate downgrade step. Full
reference: **`STRIPE.md`**.

### Billing end-to-end test suite
All 15 explicitly requested billing scenarios (registration → free tier → paywall → checkout →
webhook → premium access → cancellation → access revocation → direct-API/server-action bypass
attempts → usage-limit enforcement), covered by 17 tests, run against **PGlite** — a real
WASM-compiled Postgres, not a mock — so this is the one layer of the whole app that's actually been
exercised against real schema constraints, real transactions, and real query semantics, not just
typechecked. Only the Stripe SDK's network client itself is mocked (no live Stripe account existed
in the environment this was built in). One real bug was found and fixed in the test harness itself
(PGlite's non-UTC default session timezone was silently corrupting timestamp comparisons — fixed by
forcing UTC to match real deployed-Postgres behavior). Full reference: **`BILLING_E2E_TEST_REPORT.md`**.

### Two full production-readiness audits
1. **`PRODUCTION_READINESS_AUDIT.md`** — a broad pre-billing pass (error handling, loading states,
   rate limiting, validation hardening).
2. **`PRODUCTION_DEPLOYMENT_CHECKLIST.md`** — the first full go/no-go audit after billing was built.
   Verdict at the time: not ready — 10 real gaps, none of them code bugs (placeholder legal pages,
   `CTA_MODE` still `"waitlist"`, no live Stripe/Trigger.dev/database credentials anywhere, credit
   allowances and Stripe Price IDs still unset placeholders, no rate limiting on `/register`,
   `SITE_URL` unset, stale `README.md` claims, no password-reset flow).

### Subscription-lifecycle fixes
A follow-up, more targeted audit specifically probing subscription lifecycle, concurrency, and
webhook idempotency edge cases (not just the happy path the E2E suite covers) found and fixed **3
real issues**, all committed on the same branch (`21957c9`):

1. **BLOCKER — real double-billing risk.** The only "change plan" UI let an already-subscribed
   customer start a *second* Stripe Checkout Session — Checkout always creates a brand-new
   subscription, never modifies an existing one, so completing it would leave the customer with two
   live subscriptions, only one ever reflected in the app. Fixed: `createCheckoutSession` now throws
   `AlreadySubscribedError` for anyone with real active/trialing access, and the calling action
   redirects to the Billing Portal instead. **Requires enabling "Update subscription" in the Stripe
   Dashboard** for this to actually work end to end — not yet done, no live Stripe account exists.
2. **HIGH — credit-check race condition.** The credit check and the job/usage-cost insert were two
   independent database round trips; concurrent requests near the allowance boundary could both pass
   the check before either committed. Fixed with a transaction behind a per-owner Postgres advisory
   lock — the exact same primitive this codebase already used for an earlier Owner-bootstrap race.
   Honestly documented limitation: PGlite fully serializes all transactions regardless of locking, so
   this fix's correctness is verified by construction (matching an already-trusted pattern), not by
   an automated concurrency test — a misleading test that would pass either way was deliberately not
   shipped.
3. **HIGH — webhook duplicate/out-of-order delivery.** Stripe explicitly guarantees only
   at-least-once, not-necessarily-ordered delivery. Added an event-id dedup table (event recorded as
   processed only *after* successful handling, never before, so a genuinely failed request's retry
   still reprocesses) and a staleness guard comparing each event's own timestamp against the last one
   actually applied, so an older event can never silently overwrite newer state.

6 new tests added for these three fixes (all against the real database). Migration `0021` (new table
+ one nullable column, purely additive) carries the schema change.

**Full verification after every change in this arc**: `tsc`, lint, and production build all clean;
full test suite currently **184/184 passing**.

### Production deployment plan
**`PRODUCTION_DEPLOYMENT_PLAN.md`** — a precise, non-developer-executable runbook covering every
environment variable (20, confirmed zero `NEXT_PUBLIC_*` — nothing is ever exposed to the browser),
exact Stripe/Trigger.dev/database/storage/provider setup steps, a 13-step live smoke test, and a
single ordered checklist from Stripe Dashboard configuration through to flipping `CTA_MODE` live —
deliberately saved for the very last step.

---

## Current repository state

- **Branch**: `feat/customer-auth-stripe-billing-e2e`
- **Pull request**: [#1](https://github.com/datingwarninglabels-dot/outlet-ai-studio/pull/1) — **open, not merged** (deliberately held, per explicit instruction, pending review)
- **Latest commits**: `21957c9` (subscription-lifecycle fixes), `9255a67` (customer auth + Stripe monetization + billing E2E suite + earlier readiness fixes)
- **Tests**: 184/184 passing · `tsc --noEmit` clean · `npm run lint` clean · `npm run build` succeeds

---

## Live deployment progress (as of this file's writing)

Working step by step through `PRODUCTION_DEPLOYMENT_PLAN.md`'s ordered checklist. Dashboard-side
actions are self-reported by the user — verified in the app only once real values reach Vercel and
get exercised by the live smoke test, never claimed configured before then.

| # | Step | Status |
|---|---|---|
| 1 | Stripe Dashboard | 🟡 Products/Prices created, "Update subscription" enabled, test Secret key obtained. Webhook endpoint deliberately deferred until a real production URL exists. |
| 2 | Trigger.dev | 🟡 Production Project ref and secret key obtained. |
| 3 | Google OAuth | ✅ Skipped — confirmed optional; Credentials sign-in works fully without it. |
| 4 | Production database | 🟡 Full 12-point audit done, **Neon** recommended (native Vercel integration; app has zero SDK dependency on either Neon or Supabase). Provisioning in progress. |
| 5 | Object storage (R2/S3) | 🟡 R2 bucket + S3-compatible credentials obtained. |
| 6 | AI provider keys | 🟡 In progress — cost/dependency tiers verified from source (Anthropic is a hard blocker; ElevenLabs/Runway required for the advertised feature set; Shotstack confirmed genuinely deferrable via the export route's own fallback). User chose to set up all 4 for a full launch. |
| 7 | Vercel environment variables | ⬜ Not started — this is where everything gathered in Steps 1–6 actually gets wired into the app for the first time. |
| 8 | Run database migrations against production | ⬜ Not started |
| 9 | Deploy Trigger.dev tasks (`npx trigger.dev@latest deploy`) | ⬜ Not started |
| 10 | Merge PR #1 and deploy | ⬜ Not started (explicitly on hold) |
| 11 | Visit `/setup` to create the Owner account | ⬜ Not started |
| 12 | Finish the Stripe webhook endpoint with the live URL | ⬜ Not started |
| 13 | Run the 13-step smoke test in Stripe test mode | ⬜ Not started |
| 14 | Replace the placeholder legal pages | ⬜ Not started |
| 15 | Switch Stripe to live mode + flip `CTA_MODE` | ⬜ Not started (deliberately last) |

---

## What remains before a real public launch

Beyond finishing the checklist above:

- **Legal pages are explicit self-declared placeholders.** Privacy Policy and Terms of Service both
  say outright they're drafts to be replaced before launch; the Refund policy page currently states
  billing isn't live, which becomes false the moment Stripe is connected. Real legal review needed —
  not something this session drafts unilaterally.
- **No password-reset flow exists.** Credentials-only accounts have no self-service recovery path
  today (Google sign-in is the only fallback, and only for linked accounts).
- **`/register` has no rate limiting**, only a honeypot/timing bot check — worth revisiting now that
  Free-tier signups consume real AI-provider spend.
- **`README.md` is stale** — still describes the pre-Milestone-2 "no public sign-up" security model.
- Broader, not-yet-started Phase 2 scope: an authorization/RLS re-audit, public policy pages beyond
  the placeholders above, cost/abuse controls beyond the credit paywall, monitoring/ops
  documentation, and a full launch checklist.

---

## Key documents (detail lives here, not duplicated in this file)

| Document | What it covers |
|---|---|
| `PLAN.md` | Original Phase 1 architecture and milestone-by-milestone plan |
| `STRIPE.md` | Every Stripe environment variable, webhook events, idempotency design, credit model |
| `BILLING_E2E_TEST_REPORT.md` | All 15 billing scenarios, mapped to their exact tests and real-vs-mocked verification status |
| `PRODUCTION_READINESS_AUDIT.md` | Pre-billing readiness pass |
| `PRODUCTION_DEPLOYMENT_CHECKLIST.md` | The first full go/no-go audit, with every environment variable and its source |
| `PRODUCTION_DEPLOYMENT_PLAN.md` | The live, step-by-step deployment runbook and progress tracker — the working document for the actual launch |
| `README.md` | Project overview and local setup (currently stale on the auth section — see above) |

*This file is a snapshot, not committed to git (consistent with this project's standing rule: never
commit or push without explicit separate authorization). Regenerate or update it on request as the
deployment progresses.*
