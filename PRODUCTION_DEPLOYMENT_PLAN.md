# Production Deployment Plan — Outlet AI Studio

Audit date: 2026-08-31
Branch: `feat/customer-auth-stripe-billing-e2e` (PR [#1](https://github.com/datingwarninglabels-dot/outlet-ai-studio/pull/1) — open, not merged)
Application code: unchanged in this pass — **no blocker was found that requires a code change**. The
three code-level blockers from the earlier lifecycle audit are already fixed on this branch (commit
`21957c9`) and are not repeated here except where this plan's steps depend on them.

Classification used throughout: **BLOCKER** (cannot launch without it) / **REQUIRED** (must configure
before accepting real customers) / **RECOMMENDED** (should do soon, not launch-blocking) / **OPTIONAL**
(future improvement).

---

## Progress tracker

Updated live as each step of the "DO THIS NEXT" checklist is actually completed. Dashboard actions
(Stripe, Google, Trigger.dev, etc.) are self-reported by the user — this session has no API access
to any of those accounts and cannot independently verify them, only verify that the *app* is
actually wired up once real values reach Vercel's environment variables (Step 7) and get exercised
(Step 13's smoke test). "Stripe is configured" is not claimed as true for the app until that point,
even though the Dashboard-side prep below is done. `.env.local` checked directly (names only, no
values ever read into chat): no Stripe, Trigger.dev, or `SITE_URL` values are set anywhere yet.

| # | Step | Status |
|---|---|---|
| 1 | Stripe Dashboard | 🟡 Partially done (user-reported): Products/Prices created, "Update subscription" enabled, test Secret key obtained. Webhook endpoint (needs a real URL) deliberately deferred to Step 12, per plan. **Not yet reflected in the app** — no value has reached Vercel/`.env.local` yet. |
| 2 | Trigger.dev (project, keys) | 🟡 Done (user-reported): production Project ref and secret key obtained, held securely, not pasted here. **Not yet reflected in the app** — pending Step 7 (Vercel) and Step 9 (`npx trigger.dev@latest deploy`). |
| 3 | Google OAuth | ✅ SKIPPED — confirmed optional. Credentials sign-in fully works without it; empirically verified this whole session's build/tests run clean with zero Google credentials set. Code is ready (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `/api/auth/callback/google`) whenever it's wanted later — not required for launch. Known caveat: `/login`'s "Continue with Google" button renders unconditionally and will fail if clicked while unconfigured. |
| 4 | Production database | ⏳ IN PROGRESS — full 12-point source audit done (see Section 4a below): 1 env var (`DATABASE_URL`), pooled connection required, manual migration (`cd apps/web && npm run db:migrate`), 22 migrations confirmed present through `0021`, no seed data or special extensions needed, PGlite confirmed test-only. **Recommended provider: Neon** (native Vercel integration; app has zero Supabase/Neon SDK dependency either way — both work unmodified). Waiting on user to provision and hold the pooled connection string for Step 7. |
| 5 | Object storage (R2/S3) | 🟡 Done (user-reported): R2 bucket + S3-compatible credentials obtained (region `auto`, account-ID-based endpoint — matches verified requirements). Held securely, not pasted here. **Not yet reflected in the app** — pending Step 7. |
| 6 | AI provider keys (Anthropic, ElevenLabs, Runway, Shotstack) | ⏳ IN PROGRESS — code-verified cost/dependency tiers presented (Anthropic: non-negotiable blocker; ElevenLabs/Runway: required for the advertised feature set, technically independent of each other; Shotstack: genuinely deferrable, confirmed by the export route's own fallback behavior). User chose **all 4** for a full launch. Waiting on user to obtain all 4 keys (Runway confirmed topped up with paid credits; Shotstack production key, not sandbox) for Step 7. |
| 7 | Vercel environment variables | ⬜ Not started |
| 8 | Run database migrations against production | ⬜ Not started |
| 9 | Deploy Trigger.dev tasks | ⬜ Not started |
| 10 | Merge PR #1 and deploy | ⬜ Not started (explicitly on hold) |
| 11 | Visit `/setup` to create the Owner account | ⬜ Not started |
| 12 | Finish webhook endpoint with live URL | ⬜ Not started |
| 13 | Run the 13-step smoke test (Stripe test mode) | ⬜ Not started |
| 14 | Replace placeholder legal pages | ⬜ Not started |
| 15 | Switch Stripe to live mode + flip `CTA_MODE` | ⬜ Not started (deliberately last) |

---

## 1. Production environment variables

All 20 variables below are read server-side only (`process.env.*` inside server actions, Route
Handlers, and server-only lib modules). **Confirmed by direct grep of the codebase: zero
`NEXT_PUBLIC_*` variables exist anywhere in this app.** Nothing here is ever bundled into
client-side JavaScript — every one of them is a genuine secret or server-only config value, and
every one of them must **never be committed to git**. (`apps/web/.gitignore` already excludes
`.env*` except `.env.example` — verified against actual git history: no `.env.local` has ever been
committed. Keep it that way; never `git add -f` an env file.)

| Variable | Classification | Where the value comes from |
|---|---|---|
| `DATABASE_URL` | BLOCKER | Your Postgres provider (Supabase or Neon). **Must be the pooled connection string** (Supabase port `6543`, Neon's pooled endpoint) — a direct connection will exhaust under real serverless concurrency. |
| `AUTH_SECRET` | BLOCKER | Generate locally with `npx auth secret`, paste the output in. Never reuse a dev value in production. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | REQUIRED (for Google sign-in) | Google Cloud Console → APIs & Services → Credentials → OAuth client ID. App still works with Credentials (email/password) sign-in if you skip this, but Google sign-in silently fails without it. |
| `ANTHROPIC_API_KEY` | BLOCKER | console.anthropic.com — no key means script/storyboard generation (the core product) refuses to run. |
| `ELEVENLABS_API_KEY` | BLOCKER | elevenlabs.io/app/settings/api-keys — no key means voice generation refuses to run. |
| `ELEVENLABS_VOICE_ID` | OPTIONAL | Only if you want a non-default premade voice. |
| `RUNWAYML_API_SECRET` | BLOCKER | A **topped-up** (paid credits) org at dev.runwayml.com — visual/animation generation refuses to run without it. |
| `SHOTSTACK_API_KEY` | BLOCKER | shotstack.io — final video assembly refuses to run without it. |
| `SHOTSTACK_ENV` | OPTIONAL | Set to `"stage"` only for testing against Shotstack's free sandbox — leave unset for real production renders. |
| `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | BLOCKER | Cloudflare R2 or AWS S3 console — a private bucket + access keys. Voice/visual/animation generation all refuse to run without this (generated media is never left at a temporary provider URL). |
| `STORAGE_ENDPOINT` | REQUIRED for R2, omit for real S3 | R2 dashboard, format `https://<account_id>.r2.cloudflarestorage.com`. |
| `STORAGE_REGION` | OPTIONAL | Defaults to `"auto"` (correct for R2). Set a real AWS region only if using S3. |
| `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` | BLOCKER | trigger.dev dashboard — see Section 4. Every generation job runs as a Trigger.dev task; without these, nothing can execute at all. |
| `STRIPE_SECRET_KEY` | BLOCKER | dashboard.stripe.com/apikeys — see Section 2. |
| `STRIPE_WEBHOOK_SECRET` | BLOCKER | The signing secret from the webhook endpoint you create in Section 2. |
| `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_STUDIO` | BLOCKER | The real Stripe Price IDs from Section 2 — without these, Pro/Studio show "Coming soon" and can't be purchased. |
| `FREE_PLAN_MONTHLY_CREDIT_CENTS` / `PRO_PLAN_MONTHLY_CREDIT_CENTS` / `STUDIO_PLAN_MONTHLY_CREDIT_CENTS` | REQUIRED | A real business decision (see Section 2's credits note) — unset means the app silently runs on arbitrary placeholder values ($1/$20/$60 per month) never approved as real numbers. |
| `SITE_URL` | REQUIRED | Your real production domain, e.g. `https://outletaistudio.com`. Unset means canonical URLs, Open Graph tags, and the sitemap all incorrectly point at `http://localhost:3000` (the build already prints a warning about this). |
| `SUPPORT_EMAIL` | OPTIONAL | Only set once a real, monitored inbox exists behind it — leaving it unset simply hides the support link, which is the correct behavior until then. |

**Where to configure all of these**: Vercel → your project → Settings → Environment Variables,
scoped to the **Production** environment. Do this before the first production deploy, or the app
will fail to boot (`DATABASE_URL is not set` throws immediately — see `db/index.ts`).

---

## 2. Stripe

### Products and Prices — BLOCKER
Create two Products in the Stripe Dashboard (Product catalog → Add product): **Pro** and **Studio**.
Each needs exactly one recurring **monthly** Price. Copy each Price's id (`price_...`) into
`STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_STUDIO`. The Free plan has no Stripe Price at all — nothing
to create for it.

The actual dollar amount for each Price is a real business decision this document cannot make for
you — nothing in the codebase invents or assumes a number (`lib/plans.ts`'s `priceLabel` stays
"Coming soon" until Stripe returns a real price for a configured Price ID).

### Test vs. live mode — BLOCKER (sequencing)
Do the entire remainder of this section, and the full smoke test in Section 8, in **test mode**
first (`sk_test_...` key, test-mode Products/Prices, a real card number never charged — use Stripe's
`4242 4242 4242 4242` test card). Only after that full run succeeds should you create the live-mode
equivalents (a **separate** live secret key, live Products/Prices, a **separate** live webhook
endpoint with its own signing secret) and swap the environment variables over. Test-mode and
live-mode Price IDs are different values — don't reuse test IDs in production.

### Checkout configuration — BLOCKER
No dashboard configuration is needed for Checkout itself — this app creates Checkout Sessions
entirely server-side (`lib/stripe.ts`'s `createCheckoutSession`), in `mode: "subscription"`, with
`success_url`/`cancel_url` pointed at `${SITE_URL}/billing`. Nothing to set up beyond having a valid
Secret Key and Price IDs.

### Billing Portal configuration — BLOCKER (specifically for plan changes)
Dashboard → Settings → Billing → Customer portal:
- **Enable "Update subscription"** and select which Products/Prices a customer may switch between
  (Pro ↔ Studio). **This is a hard requirement, not a nice-to-have**: the only way this app lets an
  already-subscribed customer change plans is by redirecting them into this Portal
  (`createCheckoutSession` now refuses to start a second Checkout Session for anyone with an active
  subscription — see the lifecycle-fix commit — specifically to prevent double-billing). Without
  "Update subscription" enabled, an existing customer who clicks a different plan lands in the
  Portal with no way to actually switch.
- Also review the **Cancellation** setting here (immediate vs. end-of-period) — this app's access
  check reacts correctly either way (`getEntitlement` checks Stripe's live `status`), but it changes
  what your customers experience when they cancel.

### Webhook endpoint — BLOCKER
Dashboard → Developers → Webhooks → Add endpoint:
- **URL**: `https://<your-production-domain>/api/stripe/webhook`
- **Events to send** (exactly these four — sending more is harmless, anything unhandled is ignored):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the endpoint's **signing secret** into `STRIPE_WEBHOOK_SECRET`.

`invoice.payment_failed` is deliberately not in this list — Stripe's own retry schedule already
moves the subscription's `status` to `past_due`/`unpaid`/`canceled`, which always fires
`customer.subscription.updated` too, and that's what this app's access check actually reacts to.

### How to test the complete subscription lifecycle (test mode) — BLOCKER before going live
1. Register a real test account on your deployed app.
2. Go to `/pricing`, choose Pro, complete Checkout with `4242 4242 4242 4242`.
3. Confirm in the Stripe Dashboard (test mode) that a subscription now exists for that customer.
4. Confirm in your production database that the `subscription` table has a row for that owner with
   `plan = 'pro'`, `status = 'active'`.
5. Confirm the app's `/billing` page shows Pro and a real credit allowance.
6. From `/pricing`, choose Studio. Confirm you land in the Billing Portal (not a second Checkout),
   and that switching to Studio there actually updates `/billing` afterward.
7. Cancel the subscription from the Billing Portal. Confirm the Stripe Dashboard shows it
   canceled, and confirm `/billing` (and a real generation attempt) shows Free-tier access again.
8. Check your webhook endpoint's delivery log in the Stripe Dashboard — every event above should
   show a `200` response with no retries.

---

## 3. Database

*Re-audited fresh (12-point verification) on 2026-08-31 as part of Step 4 of the "DO THIS NEXT"
checklist — findings below fold in what changed from the original pass.*

### Production database requirements — BLOCKER
A real Postgres instance reachable via **one** environment variable, `DATABASE_URL` (confirmed: the
only DB-related var referenced anywhere in `db/index.ts` or `drizzle.config.ts`), in standard
`postgresql://user:password@host:port/dbname` format, as a **pooled** connection string. Local/direct
connections (port `5432`) will exhaust under real concurrent serverless traffic — see `db/index.ts`'s
own comment on why `max: 1` per instance assumes a pooler. **SSL**: not configured in code at all —
entirely determined by the connection string each provider gives you (both Supabase's and Neon's
already include the right parameters); nothing to add yourself. **No special Postgres extensions or
settings are required** — confirmed zero `CREATE EXTENSION` statements across all 22 migrations;
`gen_random_uuid()` (used for every primary key) has been native to Postgres core since version 13,
which both recommended providers run well above.

**Provider recommendation: Neon.** The app has zero code-level dependency on either provider — no
`@supabase/*` or `@neondatabase/*` package anywhere in `package.json`, and no route uses Vercel's
Edge runtime (everything is standard Node.js serverless), so the existing `postgres-js` driver code
works unmodified against either. The recommendation comes down to fit, not a technical requirement:
this app already has its own auth (NextAuth) and storage (R2/S3) — none of Supabase's other
platform features would ever be used — while Neon is Vercel's own native Postgres offering,
provisionable directly from Vercel's dashboard without a separate account, and doesn't carry
Supabase free tier's historical inactivity-pause behavior (worth confirming against their current
terms, not asserted as permanent). Supabase remains fully valid with zero code changes if preferred.

**PGlite (used for this project's automated tests) is confirmed test-only**: it's a `devDependency`,
not a production dependency, and the only non-test file that imports it (`src/test/pglite-db.ts`) is
itself only ever imported by `.test.ts` files. No production code path depends on it in any way.

### Exact migrations that must be applied — BLOCKER
All 22 migration files in `apps/web/drizzle/`, in order, `0000` through `0021`:

```
0000_kind_karnak.sql   0006_curved_darkstar.sql        0012_marvelous_longshot.sql   0018_complex_red_wolf.sql
0001_illegal_virginia_dare.sql  0007_previous_fantastic_four.sql  0013_warm_sheva_callister.sql  0019_nostalgic_ink.sql
0002_acoustic_gwen_stacy.sql    0008_parched_mantis.sql          0014_cultured_ulik.sql        0020_windy_shotgun.sql
0003_gigantic_klaw.sql          0009_same_thing.sql              0015_typical_bulldozer.sql    0021_legal_masque.sql
0004_bizarre_magus.sql          0010_lovely_doctor_spectrum.sql  0016_slow_wolf_cub.sql
0005_faithful_valkyrie.sql      0011_curious_doomsday.sql        0017_wandering_onslaught.sql
```

**Confirmed: migration `0021_legal_masque.sql` (the `stripe_webhook_event` table and
`subscription.last_stripe_event_created_at` column from the lifecycle fixes) is included** — it is
the newest migration and has never been applied to any real database yet, same as `0016`–`0020`.

Run them with:
```bash
cd apps/web
npm run db:migrate
```
(`DATABASE_URL` must point at the real production database when you run this — it uses the same
env var the app itself reads.)

### Safe migration order — BLOCKER (sequencing, not content)
Every one of these 22 migrations was hand-reviewed during this project for the specific hazard of
applying an unsafe single-shot `NOT NULL` addition to a table that could already have rows —
`0016`, `0020`, and (differently) `0019` all needed hand-editing for exactly this reason, and were
fixed with the nullable-add → backfill → `SET NOT NULL` pattern. `0021` is purely additive (new
table, one nullable column) and needs no such care. **Run migrations before deploying the new
application code that depends on them**, not after — since `0021`'s new table/column are additive,
running old code against the new schema is harmless, but running new code against the old schema
(no `stripe_webhook_event` table yet) would make the webhook 500 on every request. Sequence:
migrate first, then deploy/promote the build.

**One migration is genuinely destructive** — `0004_bizarre_magus.sql` drops two columns
(`generation_job.estimated_cost_cents`/`actual_cost_cents`, superseded shortly after by the
dedicated `usage_cost` table). Confirmed via a fresh grep of all 22 files for `DROP TABLE`,
`DROP COLUMN`, `TRUNCATE`, and `DELETE FROM` — this is the only hit. **Not a risk for this launch**:
since this is a brand-new database running all 22 migrations in one uninterrupted sequence with zero
existing rows at any intermediate point, there is no real data for that drop to ever touch. It's
only a discipline reminder for *future* migrations once real customer rows exist — which the three
migrations that needed it since (`0016`/`0019`/`0020`) already correctly followed.

### Seed/configuration data required — BLOCKER (one-time, not SQL)
None of this app's setup is SQL seed data — confirmed nothing in the database needs pre-populating:
Stripe Price IDs live only in environment variables (never a table), and the `subscription` table
starts completely empty (every account is implicitly "free" until a webhook creates a row). The
one required *action*, not SQL, is visiting `/setup` in the browser immediately after your first
deploy — this creates the single Owner account and locks itself permanently afterward; every
account after that is a Customer via `/register` or Google sign-in. An Owner account is required
to reach Provider Hub.

---

## 4. Trigger.dev

### Required configuration — BLOCKER
Every generation job (script, storyboard, voice, visual, animation, assembly, thumbnail,
character/world images) runs as a Trigger.dev task (`apps/web/src/trigger/*.ts`), not synchronously
in a server action — this was a deliberate Phase 2 architecture decision (Vercel's function time
limits vs. some of these jobs' multi-minute polling loops). **Without Trigger.dev fully set up, no
generation feature works at all**, even with every other API key correctly configured.

1. Sign up at trigger.dev, create a project.
2. Copy the **Project ref** (Project settings) into `TRIGGER_PROJECT_REF`.
3. Copy an **API key** (API Keys page) into `TRIGGER_SECRET_KEY`.
4. `trigger.config.ts` already reads `TRIGGER_PROJECT_REF` from the environment automatically — no
   manual file editing needed (the file's own comment currently suggests editing it directly; that's
   stale — the env var alone is sufficient).

### Jobs/tasks that must be deployed — BLOCKER
Trigger.dev tasks are **not** deployed by `next build`/Vercel — they run on Trigger.dev's own
infrastructure and need their own explicit deploy step, which nobody has run yet in this project:
```bash
cd apps/web
npx trigger.dev@latest deploy
```
Run this once after setting `TRIGGER_PROJECT_REF`/`TRIGGER_SECRET_KEY`, and again any time a file
under `src/trigger/` changes. There is no `trigger:deploy` script in `package.json` yet — add one
(`"trigger:deploy": "trigger.dev@latest deploy"`) if you'll do this often, or just run the `npx`
command directly each time — either is fine, this alone is not a blocker.

### Scheduled reconciliation tasks — currently missing (RECOMMENDED, not a blocker)
There is no scheduled task that re-polls Stripe for accounts whose webhook delivery might have
silently failed past Stripe's own retry window (~3 days). Given the webhook now has real dedup and
staleness protection (Section 2 / the lifecycle fixes), the remaining exposure is narrow (total,
sustained delivery failure — rare), but there's currently zero self-healing if it happens. Not
required for launch; worth a follow-up Trigger.dev scheduled task once real traffic exists.

---

## 5. Application deployment

### Exact build command — BLOCKER
```bash
cd apps/web
npm run build
```
which runs `next build` (Next.js 16, Turbopack). This has been re-verified clean (tsc, lint, and
build) as of this plan.

### Exact start/deployment requirements — BLOCKER
This is a standard Next.js App Router project — deploy it to Vercel by connecting the GitHub repo
(root directory `apps/web`, since this is a monorepo with the Next.js app one level down) and
letting Vercel's own Next.js build detection handle the rest. `npm run start` (`next start`) is only
relevant for a non-Vercel Node host; Vercel's own serverless runtime doesn't use it directly.

### `SITE_URL` — REQUIRED (see Section 1)
Set to your real production domain before launch — see Section 1's entry for exactly what breaks
without it.

### `CTA_MODE` — BLOCKER (code constant, not an env var)
`apps/web/src/lib/site-config.ts:20` — currently hardcoded to `"waitlist"`. **This is the one
place in this plan where the fix is a code change, but it is a single-line, deliberately-gated
constant flip, not new development** — every route it would point to (`/register`, `/pricing`,
Checkout) already exists and works. Until this is flipped to `"live"`, every marketing CTA on the
public site says "Join the Waitlist" and collects an email instead of directing visitors to
register and pay — the live product would be functionally invisible from its own homepage. **Do
not flip this until every other BLOCKER in this plan is done** — it's the intentional final switch,
not a step to do early.

### Any other production configuration — REQUIRED
- Security headers (CSP, HSTS, `X-Frame-Options`, etc.) are already configured in
  `next.config.ts` — no action needed.
- No `vercel.json` exists and none is needed for a standard deployment.
- No `engines` field is pinned in `package.json` — Vercel will pick a reasonable default Node
  version automatically; pinning one explicitly is OPTIONAL, not required.

---

## 6. Authentication

### Google OAuth configuration — REQUIRED (for Google sign-in specifically; Credentials sign-in works without it)
Google Cloud Console → APIs & Services → Credentials → your OAuth client → Authorized redirect
URIs → add:
```
https://<your-production-domain>/api/auth/callback/google
```
The existing configured URI is `localhost`-only — it must be updated for the live domain or Google
sign-in will fail in production with a redirect-mismatch error.

### Credentials (email/password) authentication — BLOCKER-adjacent, already working
bcrypt-hashed passwords, rate-limited by email (8 attempts / 10 minutes), honeypot + submit-timing
bot defense on both `/login` and `/register`. No configuration needed — this already works as
deployed.

### Password reset status — REQUIRED before real public launch (not a BLOCKER for a soft/limited launch)
**No password-reset flow exists anywhere in this codebase** (confirmed: no `forgot-password` or
`reset-password` route). A Credentials-only customer who forgets their password has no self-service
recovery path today — Google sign-in is the only fallback, and only for accounts that linked it.
This is real, expected functionality for a public product about to accept payment; treat it as a
near-term requirement even though it doesn't block a first deploy.

### Production callback URLs — BLOCKER
Beyond the Google redirect URI above, no other callback URL configuration exists — Auth.js v5 reads
the request's own host for everything else, no `AUTH_URL` env var is referenced anywhere in this
codebase.

### Security settings needing configuration — REQUIRED
- `AUTH_SECRET` must be a real, freshly-generated production value (Section 1) — never the same
  value used in any development environment.
- `/register` has only a honeypot + submit-timing bot check, no IP rate limiting (a deliberate,
  documented Milestone 2 scope decision, made before billing existed). Now that Free-tier signups
  consume real AI-provider spend, decide whether that's still acceptable before opening registration
  publicly — RECOMMENDED to revisit, not a hard blocker.

---

## 7. Legal / customer-facing requirements

All four are currently live at `/legal/privacy`, `/legal/terms`, `/legal/refunds`,
`/legal/acceptable-use` — correctly marked `noindex` in their metadata, but still reachable by
anyone, including a paying customer looking for them.

| Page | Status | Classification |
|---|---|---|
| Privacy Policy | Explicit placeholder — the page itself says: *"This draft describes, in plain terms, what Outlet AI Studio currently collects. A complete, legally-reviewed Privacy Policy will replace this page before public launch."* | **BLOCKER** — do not accept real payments/personal data under a self-declared draft policy. |
| Terms of Service | Explicit placeholder — *"A complete Terms of Service will be published before public launch."* | **BLOCKER** |
| Refund Policy | **Factually wrong**, not just incomplete — it says *"Billing is not live yet, so there is nothing to refund today,"* which will be false the moment Stripe is connected. | **BLOCKER** |
| Acceptable Use | Exists, not flagged as a draft in the same way — worth a final read before launch but not flagged as blocking in this audit. | RECOMMENDED |

None of this is something to draft unilaterally in this pass — it needs real legal review. Flagging
precisely which placeholder sentences must be replaced (above) so whoever does that review knows
exactly what's currently live and self-admittedly fake.

---

## 8. Launch verification — step-by-step smoke test

Perform this **in Stripe test mode first**, in this exact order, on the real deployed production
URL (not localhost). Each step lists what "correct" looks like.

1. **Create account** — go to `/register`, sign up with a real email you control. ✅ Redirected to
   `/dashboard`; a welcome/empty-state dashboard renders.
2. **Sign in** — sign out, then sign in again at `/login` with the same credentials. ✅ Reaches
   `/dashboard` again. Also try "Sign in with Google" if configured. ✅ Same result.
3. **Confirm Free tier** — check `/billing`. ✅ Shows plan "Free," a small credit allowance, no
   subscription status badge.
4. **Purchase a plan** — go to `/pricing`, choose Pro, complete Checkout with Stripe's test card
   `4242 4242 4242 4242`, any future expiry, any CVC. ✅ Redirected back to `/billing?checkout=success`.
5. **Confirm Stripe subscription** — Stripe Dashboard (test mode) → Customers → find this test
   customer. ✅ One active subscription, correct Price.
6. **Confirm database subscription** — query the production `subscription` table for this owner
   (via `npm run db:studio` pointed at production, or your DB provider's own SQL console). ✅ One
   row, `plan = 'pro'`, `status = 'active'`, real `stripe_customer_id`/`stripe_subscription_id`.
7. **Confirm credits** — `/billing`. ✅ Shows the real Pro credit allowance from
   `PRO_PLAN_MONTHLY_CREDIT_CENTS`, zero used.
8. **Use credits** — go to `/create-video`, run a real generation (script generation is cheapest).
   Confirm the estimate, generate. ✅ Job completes; `/billing`'s usage bar increases by roughly the
   estimated/actual cost.
9. **Hit credit limit** — either wait for real usage to accumulate, or temporarily set a very low
   `PRO_PLAN_MONTHLY_CREDIT_CENTS` for this test, then attempt a generation that exceeds it. ✅ A
   clear paywall message appears — no job is created, no charge occurs.
10. **Change plan** — from `/billing`, click "Change plan" → `/pricing` → choose Studio. ✅ You land
    in Stripe's Billing Portal (not a second Checkout Session) — confirms the double-billing fix and
    that "Update subscription" is correctly enabled (Section 2). Complete the plan change there.
    ✅ `/billing` afterward shows Studio.
11. **Cancel subscription** — from `/billing` → "Manage subscription" → Stripe Billing Portal →
    Cancel. ✅ Stripe Dashboard shows the subscription canceled (immediately or at period end,
    per your Section 2 setting).
12. **Confirm webhook behavior** — Stripe Dashboard → your webhook endpoint → Recent deliveries.
    ✅ Every event from steps 4–11 shows `200`, no retries, no repeated/duplicate-looking entries
    being reprocessed.
13. **Confirm access changes correctly** — immediately after cancellation (or after the period
    ends, depending on your setting), attempt a Pro/Studio-tier-sized generation. ✅ Correctly
    rejected with the paywall message; `/billing` shows Free.

If every step above matches its ✅, the billing system is genuinely working end to end against
real Stripe test-mode infrastructure — not just against this project's mocked test suite.

---

## Ordered "DO THIS NEXT" checklist

Written for a non-developer to follow top to bottom. Each step names exactly where to go.

1. **Stripe Dashboard** (test mode, toggle in the top-left):
   a. Create two Products — "Pro" and "Studio" — each with one monthly recurring Price. Copy both
      Price IDs.
   b. Settings → Billing → Customer portal → turn on **Update subscription**, and select Pro/Studio
      as switchable plans.
   c. Developers → Webhooks → Add endpoint. You'll need your production URL first — come back to
      this after step 4. Note: you can create the endpoint with a placeholder URL now and edit it
      later, or wait until after deployment. Either way, once created, copy the **signing secret**.
   d. Developers → API keys → copy the test-mode **Secret key**.
2. **Trigger.dev**: sign up, create a project, copy the **Project ref** and an **API key**.
3. **Google Cloud Console** (only if you want Google sign-in): create/update your OAuth client's
   authorized redirect URI to `https://<your-domain>/api/auth/callback/google`.
4. **Your database provider** (Supabase or Neon): create a production database, copy the **pooled**
   connection string.
5. **Cloudflare R2 (recommended) or AWS S3**: create a private bucket, generate access keys.
6. **Anthropic, ElevenLabs, Runway (confirm topped up with paid credits), Shotstack**: create/copy
   each API key.
7. **Vercel**: connect the GitHub repository (root directory `apps/web`). In Project Settings →
   Environment Variables (Production), enter every variable from Section 1 of this plan, using the
   values gathered in steps 1–6. Decide and enter real values for
   `FREE_PLAN_MONTHLY_CREDIT_CENTS`/`PRO_PLAN_MONTHLY_CREDIT_CENTS`/`STUDIO_PLAN_MONTHLY_CREDIT_CENTS`
   and `SITE_URL` at this step too.
8. **Run the database migrations** against the production database (someone with terminal access
   runs `cd apps/web && npm run db:migrate` with the production `DATABASE_URL`) — **before** the
   first production deploy goes live.
9. **Deploy Trigger.dev's tasks**: `cd apps/web && npx trigger.dev@latest deploy`.
10. **Merge PR #1** and deploy on Vercel.
11. **Visit `/setup`** on the live site once, immediately, to create the one Owner account — this
    screen permanently disables itself after.
12. **Go back to Stripe** and finish the webhook endpoint from step 1c with your real live URL
    (`https://<your-domain>/api/stripe/webhook`), selecting the four events listed in Section 2.
    Copy the signing secret into Vercel's `STRIPE_WEBHOOK_SECRET` and redeploy.
13. **Run the full 13-step smoke test in Section 8**, in Stripe test mode, on the real deployed URL.
14. **Get the legal pages replaced** (Privacy, Terms, Refunds — Section 7) — do not skip this before
    real customers can pay.
15. **Only after everything above is done and verified**: switch Stripe to live mode (new live
    Secret key, live Products/Prices, a second live webhook endpoint with its own signing secret),
    update those Vercel environment variables, and flip `CTA_MODE` to `"live"` in
    `apps/web/src/lib/site-config.ts` — the one code change in this entire plan, saved for last on
    purpose.
