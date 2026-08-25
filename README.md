# Outlet AI Studio

Your idea. Your voice. Your outlet.

A private, single-Owner web app for turning an idea or script into a complete
faceless-content package (video, voiceover, captions, thumbnail, publishing
copy) for TikTok, YouTube Shorts, YouTube, Facebook Reels, and Instagram
Reels.

This repo is being built milestone by milestone — see [PLAN.md](./PLAN.md)
for the full architecture and milestone plan. Nothing here fakes success:
unbuilt sections say so instead of pretending to work.

## Status

**Phase 1 (M0–M6): complete.** Idea → script → storyboard → voice →
per-scene visuals → animation → assembled final video → export package,
plus Thumbnail Studio, Provider Hub, Character Library, World Library,
Continuity Checker, long-form resilience, Brand Kit, Media Library, a unit
test suite, a security/accessibility pass, and PWA basics. See
[PLAN.md](./PLAN.md) for the full milestone-by-milestone breakdown —
including what's deliberately out of scope at each stage — and note its
own caveat: nothing in Phase 1 has been verified against a real database
or a live provider call, only `build`/`lint`/unit tests.

**Phase 2 (in progress): turning this from a private Owner tool into a
paid, multi-tenant product** — customer accounts, subscription billing,
credits, and a controlled launch. Milestone 1 (moving generation jobs off
the synchronous request path and onto Trigger.dev, since some jobs run
6–20+ minutes and that's incompatible with serverless function limits) is
done; see PLAN.md's Phase 2 section for the rest.

## Structure

```
apps/web/           Next.js app (App Router, TypeScript, Tailwind, Drizzle, Auth.js)
apps/web/src/trigger/  Generation-job task definitions (Trigger.dev) — see Phase 2 Milestone 1
```

No separate worker process — background execution is handled by Trigger.dev
tasks defined in `apps/web/src/trigger/`, triggered from server actions in
the main app. See `trigger.config.ts` and `src/trigger/lib/job-task.ts` for
how a job goes from a confirm/retry click to an async task run.

## Local setup

1. **Get a Postgres database.** [Supabase](https://supabase.com) or
   [Neon](https://neon.tech) both have free tiers and give you a
   `DATABASE_URL` immediately. A local Postgres instance works too.

2. **Create a Google OAuth client** (for Google sign-in): Google Cloud
   Console → APIs & Services → Credentials → OAuth client ID → Web
   application. Add `http://localhost:3000/api/auth/callback/google` as an
   authorized redirect URI.

3. **Configure environment variables.**

   ```bash
   cd apps/web
   cp .env.example .env.local
   npx auth secret   # writes AUTH_SECRET into .env.local
   ```

   Fill in `DATABASE_URL`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` in
   `.env.local`.

4. **Install dependencies and run migrations.**

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   ```

5. **Set up Trigger.dev** (required for any generation job to actually run —
   Phase 2 Milestone 1 moved job execution off the request path). Sign up at
   [trigger.dev](https://trigger.dev), create a project, and fill in
   `TRIGGER_SECRET_KEY` (API Keys page) and `TRIGGER_PROJECT_REF` (Project
   settings) in `.env.local` and in `trigger.config.ts`'s `project` field.

6. **Run the dev server** — two terminals:

   ```bash
   npm run dev          # terminal 1: Next.js
   npm run trigger:dev   # terminal 2: Trigger.dev's dev server
   ```

   Visit `http://localhost:3000` — since no Owner account exists yet, you'll
   land on `/setup` to create it. That screen only works once; after the
   Owner account is created it always redirects to `/login`.

## Security notes

- There is no public sign-up. The Owner account is created once via
  `/setup`, which locks itself after the first account exists.
- Google sign-in only succeeds for an email that's already the bootstrapped
  Owner — it will not silently create a second account for any Google user.
- Provider credentials are environment-variable-only for now (Provider Hub
  shows what's configured but doesn't store secrets itself yet — see
  PLAN.md's M2 section for the deliberate scope limit and what a DB-backed
  version would require).
