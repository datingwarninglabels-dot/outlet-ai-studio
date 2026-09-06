# Outlet AI Studio — Production Readiness Audit

Date: 2026-08-26
Scope: `apps/web` (Next.js 16 App Router, React 19, TypeScript, Tailwind v4, PostgreSQL + Drizzle ORM, NextAuth v5, Trigger.dev, Anthropic/ElevenLabs/RunwayML/Shotstack, R2/S3 storage).

**Verification results at audit time:**
- `npx tsc --noEmit` — clean, zero errors
- `npm run lint` — clean, zero errors/warnings
- `npm test` — **125/125 passing** (11 test files)
- `npm run build` — clean production build; route table below

```
Route (app)
┌ ƒ /                          ├ ƒ /login              ├ ƒ /projects/[id]
├ ○ /_not-found                ├ ƒ /media-library       ├ ƒ /provider-hub
├ ƒ /api/auth/[...nextauth]    ├ ƒ /projects            ├ ƒ /register
├ ƒ /api/projects/[id]/export  ├ ○ /robots.txt          ├ ƒ /settings
├ ƒ /api/projects/[id]/job-status  ├ ƒ /setup           ├ ○ /sitemap.xml
├ ƒ /brand-kit                 ├ ○ /legal/*  (5 pages)  ├ ƒ /thumbnail-studio
├ ƒ /characters, /characters/[id]                       ├ ƒ /voice-studio
├ ƒ /create-video               ├ ƒ /worlds, /worlds/[id]
├ ƒ /dashboard
```
No live database has ever been reachable in this development environment, so nothing below has been exercised end-to-end against a real Postgres instance, real provider credentials, or a real browser session — every finding is a static-code-level review (reading the actual implementation, cross-referencing schema/migrations/config, and running the checks above), not a live/interactive test.

**No application code was changed during this audit.**

---

## CRITICAL

### C1. No connection-pooling strategy for serverless deployment
**Where:** `apps/web/src/db/index.ts:16-17`
**What's wrong:** `postgres(connectionString, { prepare: false })` — only `prepare: false` is set. The `postgres` package's own defaults then apply: `max: 10` (up to 10 pooled connections *per client instance*), `idle_timeout: null` (connections never close for being idle). The app is explicitly targeted at Vercel (`README.md`, `PLAN.md`). Every concurrent/cold-started serverless function instance gets its own module scope and its own pool of up to 10 never-released connections.
**Why it matters:** Under real concurrent traffic, this can exhaust a managed Postgres provider's connection cap (Neon/Supabase's lower tiers are commonly capped well under `10 × concurrent instances`), taking the entire app offline for every user simultaneously — the single most severe "prevents a real customer from using the app" failure mode in this audit. `prepare: false` alone does not fix this — it only makes the client *compatible* with a transaction-mode pooler if the connection string is later pointed at one, which nothing today requires or documents.
**What needs to change:** Set an explicit low `max` appropriate to serverless (e.g. `max: 1`), and document/require a pooler-mode `DATABASE_URL` (Supabase pooler port `6543`, Neon pooled endpoint, or PgBouncer) in `.env.example` and the README before any real deployment.

### C2. No rate limiting on expensive AI-generation actions
**Where:** every `*JobTask.trigger()` call site — `src/app/(app)/projects/[id]/actions.ts` (script/storyboard/voice/visual/animation/assembly, 12 call sites), `src/app/(app)/projects/[id]/thumbnail-actions.ts` (2 sites), `src/app/(app)/characters/actions.ts` (2 sites), `src/app/(app)/worlds/actions.ts` (2 sites)
**What's wrong:** Every one of these is a real, billable call to Anthropic/ElevenLabs/RunwayML/Shotstack, gated only by an `auth()` session check. There is no IP-based or account-based throttle anywhere (confirmed via repo-wide grep for rate-limiting patterns — zero matches outside the waitlist/register forms). The only friction is the UI's disabled-button-while-pending state, which any direct server-action or scripted call bypasses entirely.
**Why it matters:** Now that self-service registration is open (Milestone 2), any authenticated account — including a compromised one, a buggy client retry loop, or a deliberately abusive script — can spam expensive provider calls with no server-side ceiling. This is a direct, unbounded financial exposure for the business, not a theoretical one.
**What needs to change:** A per-user request-rate limit on job-trigger actions (reusing the DB-backed approach already proven for the waitlist/register forms, scoped to `session.user.id` instead of IP).

### C3. The authenticated app is unusable on mobile
**Where:** `apps/web/src/app/(app)/layout.tsx:19-34`
**What's wrong:** The sidebar (`<aside className="flex w-64 shrink-0 ...">`) has zero responsive classes and no toggle/hamburger mechanism — it always renders at a fixed 256px, on every viewport size, with no `hidden md:flex` or equivalent. Individual page bodies do use responsive grid classes in places, but that's irrelevant when the fixed sidebar alone consumes most of a phone-width viewport before any of that content gets room to render. The marketing header (`(marketing)/marketing-header.tsx`) already has the correct pattern (a `md:hidden` toggle button driving a collapsible nav) — the authenticated shell has none of it.
**Why it matters:** This directly fails audit item 20 ("anything that would prevent a real customer from using the application") for any mobile visitor — not degraded, effectively broken.
**What needs to change:** Add a mobile nav toggle to the `(app)` layout mirroring the marketing header's existing pattern; collapse the sidebar off-canvas below `md:`.

### C4. `/login` has zero brute-force protection
**Where:** `src/auth.ts:22-44` (`Credentials.authorize()`)
**What's wrong:** No honeypot, no submit-timing check, no rate limiting or lockout after repeated failed attempts — a straight schema-parse → DB lookup → `bcrypt.compare`. This is weaker than *both* other public forms in the app: `/register` has a honeypot + timing check, and the waitlist form has a honeypot + timing check *and* real DB-backed IP rate limiting.
**Why it matters:** `/login` is the actual credential-guessing surface (a known email + password-guessing attempts against it) — it should be the *most* protected form, not the least. Open registration makes email enumeration/credential stuffing a live risk, not a theoretical one.
**What needs to change:** Add the same honeypot + timing-check pattern already proven for `/register`, plus a DB-backed per-IP (and/or per-email) rate limit on failed attempts, reusing the pattern from `(marketing)/actions.ts`.

### C5. No password-reset flow exists
**Where:** N/A — confirmed absent anywhere in `src/app` or `src/lib`
**What's wrong:** A Credentials-based user who forgets their password has no self-service recovery path at all. The only way back in is an operator manually intervening at the database level, or the user happening to also have a linked Google account.
**Why it matters:** This is a hard, permanent lockout for a real customer — arguably the single most direct violation of audit item 20. It's also effectively unbuildable *safely* without a transactional email provider, which does not currently exist in this codebase (confirmed: no Resend/Nodemailer/SendGrid/Postmark dependency).
**What needs to change:** This requires a product decision (which email provider to adopt) before it can be built — flagged here rather than implemented blind, per the standing "don't add a new provider without a documented reason" constraint. See Remaining Known Issues.

### C6. Legal pages are explicitly unreviewed
**Where:** `src/app/(marketing)/legal/legal-page.tsx:6-10` (renders on all 5 legal routes)
**What's wrong:** Every legal page (Privacy, Terms, Refunds, Acceptable Use, Copyright) is self-labeled in its own rendered copy: *"Draft — not final... has not been through legal review."*
**Why it matters:** The app now takes open public registration. Shipping without real legal review under a product taking real signups (and eventually payment) is a genuine compliance/liability exposure, not a cosmetic gap.
**What needs to change:** Real legal review by a qualified professional — not something engineering can resolve in code. Flagged as CRITICAL for launch readiness, not implemented here.

### C7. Zero security headers configured
**Where:** `apps/web/next.config.ts` (entirely default/empty — confirmed by direct read)
**What's wrong:** No Content-Security-Policy, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, or `Referrer-Policy` anywhere. No middleware-based header injection either.
**Why it matters:** No active exploit was found that this would have caught (no XSS/injection vectors exist today per the security-agent's findings), but shipping a public, authenticated, payment-adjacent product with zero defense-in-depth headers is a real gap that costs little to close.
**What needs to change:** Add a `headers()` function to `next.config.ts` with baseline CSP/HSTS/frame/content-type/referrer policies.

---

## HIGH

### H1. `actualCostCents` is never written — Provider Hub's "actual spend" is always $0
**Where:** all nine `src/trigger/*.ts` job executors; `usage_cost.actualCostCents` (`schema.ts:208`)
**What's wrong:** Every executor writes `estimatedCostCents` at job-creation time (via `requestJob()` in `lib/jobs.ts`) but none of the nine executors ever populate `actualCostCents` on completion. Provider Hub's spend aggregate (`provider-hub/page.tsx:72`, `coalesce(sum(actualCostCents), 0)`) is therefore always 0 for every job.
**Why it matters:** The business has zero real cost visibility — only pre-generation estimates exist anywhere in the system, never what was actually spent. This directly undermines the "cost estimate before confirmation" trust model the product is built around.
**What needs to change:** Each executor should compute and write a real `actualCostCents` value at completion, using the same estimation functions already in `lib/cost-estimate.ts` but fed the job's *actual* result metadata (real duration, real character count, etc.) instead of the pre-generation estimate.

### H2. Provider Hub's spend query is stale since multi-tenancy shipped
**Where:** `src/app/(app)/provider-hub/page.tsx:58-69`
**What's wrong:** The query filters `usageCosts` joined to `projects` where `eq(projects.ownerId, session.user.id)` — i.e., it shows only the *viewing Owner's own* project spend. This was correct pre-Milestone-2 (the Owner was the only account, so "scoped to the Owner" and "platform-wide" were identical); it is now silently wrong, since customer accounts have their own `ownerId`-scoped projects the Owner's session doesn't own.
**Why it matters:** An Owner opening this Owner-only admin page today sees near-$0/only-their-own-test-project spend, not real platform-wide spend — a silent, misleading number rather than an obvious error.
**What needs to change:** Since this page is already gated to `role === "owner"`, drop the `ownerId` filter (intentionally, now that the role gate is what protects it) so it aggregates across all projects.

### H3. Cost-confirmation is enforced only by caller discipline, not inside the task itself
**Where:** `src/trigger/lib/job-task.ts:23-48`
**What's wrong:** `defineJobTask()`'s `run()` re-fetches the job row but never checks `job.status === "running"` (i.e., that `confirmJob()` already flipped it from `"awaiting_confirmation"`) before executing. Today this is safe only because the *sole* callers of `.trigger()` are the `confirm*` server actions, which do gate on `confirmJob()`'s status check — but the task itself trusts its caller completely.
**Why it matters:** This is enforcement-by-convention, not defense-in-depth. Any future code path that calls `xJobTask.trigger({ jobId })` on a still-unconfirmed job (a new admin action, a dashboard-triggered retry, a bug) would run and charge the provider anyway.
**What needs to change:** Add a `job.status === "running"` check inside `defineJobTask`'s `run()` itself, failing loudly if a task somehow executes against an unconfirmed job.

### H4. No `error.tsx`/`loading.tsx`/`not-found.tsx`/`global-error.tsx` anywhere
**Where:** confirmed absent via a recursive glob across the entire `src/app` tree — zero matches for any of the four Next.js App Router convention files, at any route segment.
**What's wrong:** Every server-rendered page does async DB/auth work before returning; without `loading.tsx`, a slow fetch renders nothing (blank page, not a skeleton) until the whole tree resolves. Without `error.tsx`, any uncaught error anywhere falls through to Next's generic, unbranded error screen. Every `notFound()` call (six call sites across projects/characters/worlds/provider-hub) renders Next's bare default 404.
**Why it matters:** Directly violates audit items 11 and 12 (error handling, loading states) and is a real, visible degradation for any real customer who hits a slow connection or an unexpected error.
**What needs to change:** Add a root `error.tsx`/`global-error.tsx`, and `error.tsx`/`loading.tsx`/`not-found.tsx` for the `(app)` route group at minimum.

### H5. No deployment configuration or documentation exists
**Where:** confirmed absent — no `vercel.json` anywhere in the repo, no `.github/workflows` (no CI at all), no deployment section in `README.md`
**What's wrong:** Despite `PLAN.md` and `README.md` repeatedly stating the app targets Vercel, there is no `vercel.json` (needed to tell Vercel this is a subdirectory app — `apps/web`, not the repo root — since there's no root `package.json`/workspace config), no automated lint/typecheck/test/build gate on push or PR, and no written deployment steps.
**Why it matters:** "It builds locally" is not the same as "it's actually deployable" — the monorepo-shaped layout (code in `apps/web/`, no root workspace tooling) needs explicit Root Directory configuration that isn't self-evident from the repo alone.
**What needs to change:** Document the Vercel Root Directory setting and required env vars in the README; optionally add a CI workflow running the same four checks this audit already runs.

### H6. CTA_MODE still points every marketing CTA at the waitlist, not `/register`
**Where:** `src/lib/site-config.ts:20`
**What's wrong:** `CTA_MODE: CtaMode = "waitlist"` is hardcoded, even though `/register` is fully built and functional (Milestone 2). Every "Join the Waitlist" button on the public site still points at the on-page waitlist form, not the real signup flow.
**Why it matters:** A real prospective customer visiting the live marketing site today has no discoverable path to the working registration flow — a genuine product/engineering mismatch, not a bug in the registration flow itself.
**What needs to change:** This is a launch-timing/business decision (per `PLAN.md`'s own note when `/register` shipped), not something to flip unilaterally — flagged here, not changed, pending explicit approval.

---

## MEDIUM

### M1. Zero explicit indexes on any foreign-key column
**Where:** `apps/web/src/db/schema.ts` — every FK column across all 22 tables (confirmed via grep: no `index()`/`uniqueIndex()` calls anywhere in the schema)
**What's wrong:** Postgres does not auto-index foreign keys the way primary keys are indexed. `scene.projectId`, `generation_job.projectId`, `media_asset.projectId`/`ownerId`, `job_step.jobId` (polled repeatedly by the UI) are the highest-traffic examples.
**Why it matters:** Fine at today's near-zero data volume; will cause real, worsening query slowness as customer data accumulates — the kind of gap that's cheap to fix now and expensive to diagnose later.
**What needs to change:** Add indexes on the highest-traffic FK columns listed above at minimum, ideally all of them.

### M2. The "exactly one of projectId/characterId/worldId" invariant has no database-level enforcement
**Where:** `generation_job` and `usage_cost` tables (`schema.ts:150-158, 196-211`)
**What's wrong:** Enforced only via a TypeScript discriminated union in the single `requestJob()` choke point (`lib/jobs.ts:17-71`). No `CHECK` constraint exists anywhere in any migration.
**Why it matters:** Solid today because there's exactly one insert path, but it's a convention, not a guarantee — any future insert bypassing `requestJob()` (a script, a new admin action, a careless refactor) could silently violate the invariant with nothing in the database to catch it.
**What needs to change:** Add a `CHECK (num_nonnulls(project_id, character_id, world_id) = 1)` constraint (or equivalent) to both tables.

### M3. Settings page displays a live 2FA status for a feature that can never be enabled
**Where:** `src/app/(app)/settings/page.tsx:29-32`
**What's wrong:** Reads and displays the real `users.twoFactorEnabled` column ("Enabled"/"Not set up yet"), but there is no 2FA enrollment or verification flow anywhere in the app — the column can never actually become `true` through any code path.
**Why it matters:** UI referencing dead data is misleading — "Not set up yet" implies a setup flow exists.
**What needs to change:** Either remove the row until 2FA is built, or relabel it clearly as "Not available yet."

### M4. Stale/misleading in-app copy contradicts what's actually built
**Where:** `src/app/(app)/create-video/page.tsx:18-19` ("Storyboard, voice, and visuals come next — not wired up yet" — all three are fully built on the project detail page); `src/app/(app)/thumbnail-studio/page.tsx:7` ("ship in milestone M7" — `PLAN.md` records Thumbnail Studio as already shipped, just accessible per-project rather than at this standalone nav destination)
**Why it matters:** Actively misleads a real user about what the product can do.
**What needs to change:** Correct both copy blocks to reflect actual current capability.

### M5. Two form inputs with no associated `<label>`
**Where:** `src/app/(app)/media-library/media-card.tsx:85-91` (rename input), `:104-109` (tags input) — both rely on placeholder text only
**Why it matters:** Real accessibility gap; placeholder text isn't a reliable accessible name across assistive tech.
**What needs to change:** Add proper `<label htmlFor>` pairs, matching the pattern already used correctly elsewhere in the same app (e.g. `media-upload-form.tsx`).

### M6. `AUTH_SECRET` silently falls back to a hardcoded literal if unset
**Where:** `src/app/(marketing)/actions.ts:24`
**What's wrong:** `process.env.AUTH_SECRET ?? "outlet-ai-studio-waitlist"` — if `AUTH_SECRET` is ever unset in a deploy, the waitlist's IP-hash salt silently downgrades to a known public string rather than failing loudly.
**Why it matters:** Low-severity on its own (only affects rate-limit-bypass resistance for the waitlist form), but a silent security downgrade is worse than a loud failure.
**What needs to change:** Either remove the fallback (fail loudly if unset) or at minimum log a warning, matching the pattern already used for `SITE_URL`.

### M7. Several dependencies in the critical path are pre-1.0 or explicit beta
**Where:** `apps/web/package.json` — `next-auth@5.0.0-beta.32` (explicit beta), `drizzle-orm@^0.45.2`/`drizzle-kit@^0.31.10` (pre-1.0 — the entire data layer), `@anthropic-ai/sdk@^0.120.0` (pre-1.0), `sharp@^0.35.3` (pre-1.0, security-sensitive native image library with a history of libvips CVEs)
**Why it matters:** Not a bug today, but a real operational risk profile to be aware of before a production launch — breaking changes or security advisories in any of these land without the stability guarantees a 1.0+ release implies.
**What needs to change:** No code change; monitor release notes/advisories for these specifically before and after launch. Not touched in this pass per the "don't replace providers without a documented reason" constraint.

### M8. No cascade-delete safety net exists yet (dormant, but worth fixing before it's needed)
**Where:** no `deleteProject`/`deleteUser` action exists anywhere in the app today
**What's wrong:** The schema's cascade deletes (e.g. a project delete would cascade through `usage_cost`, destroying historical spend/billing records) have never actually fired, and every real per-asset delete path in the app correctly cleans up the storage object *before* the DB row — a future DB-level cascade would bypass that entirely, orphaning storage objects with no cleanup mechanism (no cron/background sweep exists).
**Why it matters:** Not a bug today (the feature doesn't exist), but exactly the kind of gap that becomes an incident the day someone builds "delete my account."
**What needs to change:** Nothing to fix now — flagged so whoever builds account/project deletion is aware of the storage-orphaning risk and the billing-record-destruction risk up front.

---

## LOW

### L1. No explicit JWT session `maxAge`
**Where:** `src/auth.config.ts:10-12`
**What's wrong:** `session: { strategy: "jwt" }` with no `maxAge` — relying on NextAuth's undocumented-in-this-codebase 30-day default.
**What needs to change:** Set an explicit `maxAge` matching an actual product decision about session lifetime, rather than an implicit library default.

### L2. API routes have a middleware-shadowed auth check
**Where:** `src/app/api/projects/[id]/export/route.ts:15-18`, `src/app/api/projects/[id]/job-status/route.ts:14-17`
**What's wrong:** Both routes correctly check `session?.user` and return a `401` JSON response — but `proxy.ts`'s middleware already redirects a fully anonymous request to `/login` before it ever reaches these handlers, so the route's own `401` branch is effectively dead code for that case (it would only fire in an edge case where a valid session cookie exists but `session.user` is somehow falsy).
**What needs to change:** Not a bug — just note that the two guards overlap; no action strictly required.

### L3. `create-video`'s idempotency redirect doesn't re-check ownership before redirecting
**Where:** `src/app/(app)/create-video/actions.ts:57-65`
**What's wrong:** The double-submit guard looks up an existing job by `idempotencyKey` alone and redirects to its project without an ownership check first — not exploitable (the destination page re-verifies ownership via `loadOwnedProject` and would 404 for a non-owner), but worth tightening for consistency with every other action's pattern.

### L4. No email verification
**Where:** `users.emailVerified` (`schema.ts:21`) — confirmed fully inert, written only by the OAuth adapter, never read anywhere
**What's wrong:** A Credentials-registered account can use every feature immediately with an unverified, possibly-fake email.
**Why it matters:** Deliberate, documented gap (no transactional email provider exists yet) — same reasoning as C5's password-reset gap. Lower severity than C5 because it doesn't lock anyone out, just permits unverified accounts.

---

## NICE TO HAVE

- **N1.** Analytics adapter (`lib/analytics.ts`) is a permanent no-op by design — wire up a real provider once one is chosen.
- **N2.** `SUPPORT_EMAIL`/`SOCIAL_LINKS` are intentionally empty placeholders — fill in once real values exist.
- **N3.** Brand Kit fields (logo/intro/outro/watermark/caption style/music mood) are stored but not yet consumed by the assembly pipeline.
- **N4.** Job-completion notifications are client-poll-only; true background push would need a service-worker VAPID subscription setup.
- **N5.** `TRIGGER_PROJECT_REF`'s `.env.example` fallback is an obviously-broken placeholder string with no runtime warning if left unset (unlike `SITE_URL`, which does warn) — low-value, low-risk polish.

---

## Recommended Implementation Order

1. **C1** (DB pooling) and **C3** (mobile app shell) first — both are pure availability/usability blockers with no dependency on anything else, and C1 in particular risks a full outage under any real load.
2. **C2** (generation rate limiting) and **C4** (`/login` brute-force protection) next — both reuse an already-proven pattern (the waitlist form's rate limiter), so they're fast to implement safely.
3. **H4** (error/loading/not-found boundaries) and **C7** (security headers) — standard, low-risk, high-value Next.js hardening.
4. **H1**–**H3** (cost tracking, Provider Hub spend query, confirm-before-charge defense-in-depth) — closes real operational blind spots before the business needs to trust its own numbers.
5. **M1**–**M6** — indexes, the CHECK constraint, stale copy, the two unlabeled inputs, and the `AUTH_SECRET` fallback — batchable together, all low-risk and mechanical.
6. **H5** (deployment docs/config) — do this once ready to actually deploy, not before.
7. **C5** (password reset) and **L4** (email verification) — blocked on choosing a transactional email provider; this is the next real product decision needed, not an engineering task to start blind.
8. **C6** (legal review) and **H6** (CTA_MODE flip) — business decisions, not engineering tasks; sequence them whenever the business is ready, independent of the above.
9. **M7**, **M8**, **L1**–**L3**, and the Nice-to-Have list — address opportunistically; none are launch-blocking on their own.

Payment/billing integration is explicitly out of scope for this pass.
