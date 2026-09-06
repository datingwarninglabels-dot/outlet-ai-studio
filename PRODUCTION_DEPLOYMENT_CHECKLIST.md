# Production Deployment Checklist — Outlet AI Studio

Audit date: 2026-08-31 (re-verified same day — second audit pass)
Branch audited: `feat/customer-auth-stripe-billing-e2e` (PR [#1](https://github.com/datingwarninglabels-dot/outlet-ai-studio/pull/1), not yet merged to `main`)

**This is an audit only. Nothing was deployed, and no code was changed as part of this pass.**

## Re-verification note

This audit was requested a second time with the framing "Outlet AI Studio is now ready for
production deployment." I re-checked rather than assumed that framing was accurate. Result: **I
found no evidence anything changed since the previous audit** —

- `git log`/`git status`: no new commits on this branch, no modified tracked files since the last
  audit; PR #1 is still open and unmerged.
- `CTA_MODE` in `src/lib/site-config.ts` is still `"waitlist"`.
- The Privacy, Terms, and Refunds pages still contain the exact same placeholder-draft language
  ("This draft describes...", "A complete Terms of Service will be published...", "...policy will
  be published alongside billing...").
- `README.md` still says "There is no public sign-up," unchanged.
- The local `.env.local` (never committed, checked directly) has only `DATABASE_URL` and
  `AUTH_SECRET` set — no Stripe, Trigger.dev, Anthropic, ElevenLabs, Runway, Shotstack, storage, or
  Google OAuth credentials of any kind are present anywhere in this environment.

Every blocker from the previous pass still applies, unchanged. `npx tsc --noEmit`, `npm run lint`,
`npx vitest run` (178/178), and `npm run build` were all re-run fresh for this pass and are still
clean — the code itself hasn't regressed — but nothing on the readiness side has moved. The
checklist below is the same one, re-verified line by line rather than assumed still valid.

## Go / no-go summary

**Not ready to deploy yet — unchanged from the last audit.** All mechanical checks (build/typecheck/
lint/tests) are clean, and the core security-critical logic (auth, authorization, paywall, webhook
signature verification) is sound. But there are real blockers below that have nothing to do with
code quality — they're business/legal decisions and one-time external setup steps nobody has done
yet, several of which this session cannot do on your behalf (see "Do not make assumptions about
missing credentials" — none were assumed; every credential-shaped item below is reported as
**absent**, not guessed at, and was re-checked directly for this pass, not carried over from memory).

---

## 1. Blockers — must resolve before a real production launch

These aren't code bugs; they're the difference between "the code is correct" and "this is ready to
put in front of paying customers."

1. **`CTA_MODE` is still `"waitlist"`** ([`src/lib/site-config.ts:20`](apps/web/src/lib/site-config.ts)).
   Registration and billing are fully built, but every marketing CTA still says "Join the
   Waitlist" and links to an on-page email-collection form, not `/register`. Flip this to `"live"`
   only once you're actually ready for the public to sign up and pay — it's a one-line change,
   deliberately gated so it can't happen by accident.
2. **Privacy Policy and Terms of Service are explicitly placeholder drafts**, not real legal
   documents — both pages say so directly ("This draft... will be replaced... before public
   launch" / "A complete Terms of Service will be published before public launch"). Both are
   already `noindex`. Taking real payments via Stripe without real, reviewed legal terms is a
   legal/compliance risk, not an engineering one — I'm not drafting these for you; they need real
   review.
3. **The Refunds & Cancellation page is now factually wrong.** It says "Billing is not live yet, so
   there is nothing to refund today" — but billing is now fully built. This page needs real content
   describing your actual refund/cancellation policy before launch, not just a fix to the wrong
   sentence.
4. **No real Stripe account has ever exercised this code.** The billing E2E test suite
   ([`BILLING_E2E_TEST_REPORT.md`](BILLING_E2E_TEST_REPORT.md)) verified all 15 requested scenarios
   against a real database, but the Stripe SDK itself is mocked in every test — there is no
   `STRIPE_SECRET_KEY`, no real webhook delivery, and no real Checkout session in this environment.
   A real test-mode run-through (see Section 5's manual steps) has never happened.
5. **No migration has ever been applied to a real database.** All 21 migrations (including the 5
   newest — customer roles, `media_asset` ownership, rate limiting, indexes/CHECK constraints, and
   the new `subscription` table) are generated and hand-reviewed for safety, but only ever run
   against PGlite in tests. They've never touched a real Postgres instance.
6. **Trigger.dev has never been deployed.** `TRIGGER_PROJECT_REF`/`TRIGGER_SECRET_KEY` are unset
   everywhere in this environment, and there's no Trigger.dev account behind this project yet. Every
   generation job (script, storyboard, voice, visual, animation, assembly, thumbnail,
   character/world images) runs as a Trigger.dev task — **none of them can run at all** until this
   exists and `npx trigger.dev@latest deploy` has been run at least once.
7. **Credit allowances and plan pricing are undecided, real business numbers.** `FREE_PLAN_MONTHLY_CREDIT_CENTS`
   / `PRO_PLAN_MONTHLY_CREDIT_CENTS` / `STUDIO_PLAN_MONTHLY_CREDIT_CENTS` are unset, so the app would
   silently run on development-only placeholder values ($1 / $20 / $60 per month, chosen arbitrarily
   for tests, never approved as real numbers) if deployed today. `STRIPE_PRICE_ID_PRO`/`_STUDIO` are
   also unset, so both paid plans would show "Coming soon" and can't actually be purchased.
8. **Open registration has no rate limiting, only a honeypot + timing check.** This was a deliberate,
   documented scope decision during Milestone 2 (matching the waitlist form's bar), made *before*
   billing existed. Now that Free-tier signups consume real AI-provider spend (even a small
   allowance, multiplied by scripted mass signups, is real money), it's worth a fresh decision: is
   honeypot-only abuse protection still acceptable on a live paid product, or does `/register` need
   the same rate-limiting `/login` already has (or a CAPTCHA)? This needs your call, not mine.
9. **`SITE_URL` is unset.** The build already warns loudly about this
   (`[site-config] SITE_URL is not set in production...`) — canonical URLs, Open Graph tags, and the
   sitemap all point at `http://localhost:3000` until this is set to your real domain.
10. **`README.md` describes a product that no longer exists.** It still says "There is no public
    sign-up" and "Google sign-in only succeeds for an email that's already the bootstrapped Owner" —
    both are now false (open registration shipped in Milestone 2). Not a deploy blocker by itself,
    but it's actively misleading documentation about your own security model; worth fixing before
    anyone else reads it as current.

---

## 2. Environment variables — full list and where each is configured

None of these are set in this environment. Every row below reflects what the **code** requires or
supports — no value has been assumed or guessed at.

| Variable | Required for | Configure in |
|---|---|---|
| `DATABASE_URL` | Everything — the app won't boot without it | Your Postgres provider (Supabase/Neon) → **Vercel** Project Settings → Environment Variables. Must be a **pooled** connection string (Supabase port `6543`, Neon's pooled endpoint) — see `.env.example`'s note; a direct connection will exhaust under real concurrent serverless traffic. |
| `AUTH_SECRET` | Session/JWT signing, and salts the rate-limit key hash | Generate with `npx auth secret` → **Vercel** env vars |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google sign-in | **Google Cloud Console** → APIs & Services → Credentials → OAuth client ID → **Vercel** env vars. The authorized redirect URI must be updated to `https://<your-production-domain>/api/auth/callback/google` — the existing one is `localhost` only. |
| `ANTHROPIC_API_KEY` | Script/storyboard generation | **console.anthropic.com** → **Vercel** env vars |
| `ELEVENLABS_API_KEY` | Voice generation | **elevenlabs.io/app/settings/api-keys** → **Vercel** env vars |
| `ELEVENLABS_VOICE_ID` | Optional — default voice override | Same as above, optional |
| `RUNWAYML_API_SECRET` | Visual (image) and animation generation | A **topped-up** org at **dev.runwayml.com** → **Vercel** env vars |
| `SHOTSTACK_API_KEY` | Final video assembly | **shotstack.io** → **Vercel** env vars |
| `SHOTSTACK_ENV` | Optional — set `"stage"` to render against the free sandbox instead of production | **Vercel** env vars, optional |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Private object storage for all generated media — required before voice/visual/animation generation runs at all | **Cloudflare R2** or **AWS S3** console → **Vercel** env vars |
| `STORAGE_ENDPOINT` | Only for R2 (leave unset for real S3) | R2 dashboard (`https://<account_id>.r2.cloudflarestorage.com`) → **Vercel** env vars |
| `STORAGE_REGION` | Optional (defaults to `"auto"`, correct for R2) | Set a real region only if using S3 |
| `TRIGGER_SECRET_KEY` | Enqueuing/running every generation job | **trigger.dev** dashboard → API Keys → **Vercel** env vars, and wherever you run `trigger.dev deploy` |
| `TRIGGER_PROJECT_REF` | Same | **trigger.dev** dashboard → Project settings → **Vercel** env vars (the app reads it from the environment already — `trigger.config.ts` does **not** need manual editing, despite what `README.md` currently says) |
| `STRIPE_SECRET_KEY` | Any billing feature | **dashboard.stripe.com/apikeys** — start with a test-mode key → **Vercel** env vars |
| `STRIPE_WEBHOOK_SECRET` | Verifying webhook authenticity | **dashboard.stripe.com/webhooks** — create an endpoint pointed at `https://<your-domain>/api/stripe/webhook` first, then copy its signing secret → **Vercel** env vars |
| `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_STUDIO` | Making Pro/Studio purchasable | **dashboard.stripe.com/prices** — create a recurring monthly Price under a Product for each plan first → **Vercel** env vars |
| `FREE_PLAN_MONTHLY_CREDIT_CENTS` / `PRO_PLAN_MONTHLY_CREDIT_CENTS` / `STUDIO_PLAN_MONTHLY_CREDIT_CENTS` | Real (not placeholder) credit allowances | A business decision only you can make → **Vercel** env vars once decided |
| `SITE_URL` | Correct canonical URLs, OG tags, sitemap | Your real production domain → **Vercel** env vars |
| `SUPPORT_EMAIL` | Optional — shows a support contact in the marketing footer | Only set once a real, monitored inbox exists → **Vercel** env vars |

**Not currently referenced by any code, but commonly needed for Auth.js v5 behind a custom
domain/proxy**: `AUTH_TRUST_HOST`. Next-auth v5 auto-detects the URL from Vercel's request headers
in most setups — flag this only if you see redirect/callback-URL issues after the first deploy to a
real domain.

---

## 3. Checklist results, item by item

| Area | Result |
|---|---|
| **npm build** | ✅ `npm run build` succeeds; all expected routes present, including `/billing`, `/pricing`, `/register`, `/api/stripe/webhook` |
| **TypeScript** | ✅ `npx tsc --noEmit` — 0 errors |
| **Lint** | ✅ `npm run lint` — 0 errors, 0 warnings |
| **Tests** | ✅ `npx vitest run` — 178/178 passing, 16 test files, real-database billing E2E suite included |
| **Database migrations** | ⚠️ All 21 migrations reviewed and follow the safe nullable-add → backfill → `NOT NULL` pattern where needed. **Never applied to a real database** — see Blocker 5. |
| **Authentication** | ✅ Credentials (bcrypt, rate-limited by email, honeypot + timing bot check) + Google OAuth via Auth.js v5, JWT sessions. Solid. |
| **Authorization** | ✅ `users.role` (owner/customer) gates Provider Hub at both the middleware and page level (defense-in-depth). Every owned-resource lookup (`project`, `character`, `world`, `media_asset`) goes through a consistent `loadOwned*` helper in `lib/authz.ts` — no ad-hoc ownership checks found. |
| **Stripe billing** | ✅ Real Checkout + Billing Portal (hosted, redirect-based — no publishable key needed, no Stripe.js in the browser). Server-side paywall enforced in `requestJob()`, the single choke point every generation type funnels through. ⚠️ Never run against a real Stripe account — see Blocker 4. |
| **Stripe webhook** | ✅ Raw-body signature verification against `STRIPE_WEBHOOK_SECRET` before anything else runs; idempotent upsert; 500 on internal failure so Stripe retries rather than silently dropping a state change. |
| **Environment variables** | See Section 2 — every one documented in `.env.example`, cross-checked against actual `process.env` usage in code, no mismatches found. |
| **Trigger.dev configuration** | ⚠️ `trigger.config.ts` correctly reads `TRIGGER_PROJECT_REF` from the environment; no account/project exists yet, and no `trigger:deploy` script exists in `package.json` — deploying task definitions is a manual step (see Section 5). |
| **Anthropic configuration** | ✅ Gated correctly — script/storyboard generation disables and explains itself if `ANTHROPIC_API_KEY` is unset. Key itself not present in this environment. |
| **ElevenLabs configuration** | ✅ Same pattern — gated, no key present here. |
| **Runway configuration** | ✅ Same pattern — gated, no key present here. Note from `.env.example`: the Runway org needs to be **topped up** (paid credits), not just have an API key. |
| **Shotstack configuration** | ✅ Same pattern — gated, no key present here. |
| **R2/S3 storage** | ✅ Works with either via the same S3-compatible client; correctly gated behind `isConfigured()`. No bucket/keys present here. |
| **API routes** | ✅ Only 4 route handlers exist; the 2 non-auth/non-webhook ones (`export`, `job-status`) both check session **and** resource ownership. Confirmed via the E2E suite (scenario 12) that no route file anywhere calls `requestJob` — generation can only be triggered through the ownership-checked server-action path. |
| **Error handling** | ✅ Error boundaries at root and app-shell level, loading states, sanitized failure messages from job executors. Verified rendering correctly (screenshot-checked) on the one page this sandbox could reach without a live database. |
| **Security** | ✅ CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, HSTS, `Permissions-Policy` all set in `next.config.ts`. Rate limiting on login (fails open on DB error — a deliberate, documented tradeoff). `.env*` correctly excluded from git (verified: `.env.local` has never been committed, in this repo's history or the currently staged tree). ⚠️ See Blocker 8 (registration has no rate limit). |
| **Mobile responsiveness** | ✅ (partial verification) `/register` renders cleanly at 375px width — no overflow, full-width touch-friendly controls. Could not verify any authenticated page (dashboard, billing, create-video, etc.) in this sandbox — same pre-existing "no reachable live database" limitation that has applied to every milestone in this project; this is an environment constraint, not a new gap. The M6 accessibility pass already swept touch targets to a 44px minimum app-wide, so the same design-system conventions should apply, but this hasn't been re-verified visually since. |
| **Production URLs** | ⚠️ `SITE_URL` unset — see Blocker 9. |
| **Metadata** | ✅ Root layout sets title/description/icons/manifest; marketing layout sets `metadataBase` from `SITE_URL`; homepage has real Open Graph + Twitter card metadata. |
| **robots.txt** | ✅ Generated (`src/app/robots.ts`), explicit deny-list of every private app route. Minor gap: `/billing` isn't in the deny-list even though it's an authenticated app page (not meant to be crawled) — everything else authenticated is. |
| **sitemap.xml** | ✅ Generated (`src/app/sitemap.ts`), currently lists only the homepage — deliberate, since `/legal/*` is still `noindex` draft content. Revisit once legal pages are final and `/pricing` is meant to be public. |
| **Favicon** | ✅ `favicon.ico` present, plus a full PWA icon set (192/512/maskable/apple-touch). |
| **Legal pages** | ⚠️ All 5 pages (`privacy`, `terms`, `refunds`, `acceptable-use`, `copyright`) exist and render, all correctly marked `noindex` — but see Blockers 2 and 3. |
| **Privacy policy** | ⚠️ Explicit draft placeholder — Blocker 2. |
| **Terms of service** | ⚠️ Explicit draft placeholder — Blocker 2. |

---

## 4. Things that are genuinely fine as-is (no action needed)

- Build/typecheck/lint/test are all clean with zero warnings.
- The webhook, entitlement, and paywall logic is sound and was independently verified against a
  real database in the E2E suite — this is the one area of the app that's actually been tested
  against real Postgres semantics, not just typechecked.
- No secret has ever been committed to this repo — verified directly against git history, not
  assumed.
- Security headers, CSP, and rate-limiting exist where they matter most (login).
- Every provider integration fails loudly and specifically (not silently) when unconfigured.

---

## 5. Exact manual steps, in order

You'll need accounts/access for: a Postgres provider, Google Cloud Console, Anthropic, ElevenLabs,
Runway (topped up), Shotstack, Cloudflare R2 or AWS S3, Trigger.dev, Stripe, and Vercel.

1. **Decide the business numbers first** — real monthly credit allowances for Free/Pro/Studio, and
   create the actual Stripe Products/Prices for Pro and Studio (monthly recurring). Nothing past
   this point matters until these exist.
2. **Get real legal pages.** Have Privacy Policy, Terms of Service, and a real Refunds/Cancellation
   policy reviewed and written — don't launch billing on the current placeholder text.
3. **Provision a production Postgres database** (Supabase or Neon). Copy its **pooled** connection
   string.
4. **Run the real migrations** against that database: `cd apps/web && npm run db:migrate` (with
   `DATABASE_URL` pointed at the real production database). Watch for the two `CHECK` constraint
   statements in `0019_nostalgic_ink.sql` — per that migration's own comment, if either fails to
   apply, it means an actual data-integrity violation exists and needs investigating, not retrying
   past.
5. **Create a Trigger.dev account and project.** Copy `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`.
   Run `npx trigger.dev@latest deploy` from `apps/web` at least once — generation jobs silently
   cannot run until this has happened.
6. **Create/update the Google OAuth client** in Google Cloud Console: add
   `https://<your-production-domain>/api/auth/callback/google` as an authorized redirect URI.
7. **Get API keys**: Anthropic, ElevenLabs (and confirm which voice ID you want as the default),
   Runway (confirm the org is topped up with paid credits, not just has a key), Shotstack.
8. **Provision object storage** (Cloudflare R2 recommended — cheaper egress): create a private
   bucket, generate access keys.
9. **Set up Stripe for real**: get your secret key (test mode first), create a webhook endpoint at
   `https://<your-production-domain>/api/stripe/webhook`, select at minimum
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, and copy the signing secret.
10. **Set every environment variable from Section 2** in Vercel's Project Settings, for the
    Production environment.
11. **Merge [PR #1](https://github.com/datingwarninglabels-dot/outlet-ai-studio/pull/1) to `main`** and
    deploy to Vercel (or connect the repo if not already connected).
12. **Run a real end-to-end test in Stripe test mode**: register a real test account, start Checkout
    with a Stripe test card, confirm the webhook actually updates the `subscription` table, confirm
    premium access unlocks, then cancel and confirm access is actually revoked. This has never been
    done — Section 1, Blocker 4.
13. **Decide on Blocker 8** (registration rate-limiting) before opening signups publicly.
14. **Only once 1–13 are done and verified**: switch Stripe from test mode to live mode (new live
    secret key + live webhook endpoint + live Price IDs), flip `CTA_MODE` to `"live"` in
    `src/lib/site-config.ts`, and deploy that change.
15. Update `README.md` to reflect the current state of the product (open registration, billing) —
    not a launch blocker, but it currently documents a security model that no longer exists.

I have not performed steps 1–14 myself, made up values for any of them, or assumed any credential
exists — every item above reflects what I could directly verify was absent or unset in this
environment.
