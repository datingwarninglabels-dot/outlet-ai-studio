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

**M0 — App shell**: Owner auth (email/password + Google), Postgres schema,
protected dashboard shell with honest empty/placeholder states. No AI
generation yet.

## Structure

```
apps/web/     Next.js app (App Router, TypeScript, Tailwind, Drizzle, Auth.js)
```

A `worker` app and shared `packages/` will be added once background
rendering jobs are needed (milestone M1+).

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

5. **Run the dev server.**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000` — since no Owner account exists yet, you'll
   land on `/setup` to create it. That screen only works once; after the
   Owner account is created it always redirects to `/login`.

## Security notes

- There is no public sign-up. The Owner account is created once via
  `/setup`, which locks itself after the first account exists.
- Google sign-in only succeeds for an email that's already the bootstrapped
  Owner — it will not silently create a second account for any Google user.
- Provider credentials (added in a later milestone via Provider Hub) are
  encrypted at rest and never returned to the client in full.
