# Outlet AI Studio — Architecture & Milestone Plan

Source spec: [docs/master-prompt.md](./docs/master-prompt.md).

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
  primitives (restyled, original branding). PWA via manifest + service
  worker (added when the app is otherwise stable — M8).
- **Backend:** Next.js server actions/API routes for CRUD. A **separate
  worker process** (Node + BullMQ + Redis) for rendering/export jobs,
  introduced in M1 when real generation jobs exist — not before, to avoid
  standing up infrastructure with nothing to run on it yet.
- **Database:** PostgreSQL (Supabase or Neon) + Drizzle ORM.
- **Object storage:** Cloudflare R2 or S3 — private buckets, signed URLs.
- **Auth:** Auth.js (NextAuth v5) — email/password + Google OAuth, TOTP
  scaffolding for future-mandatory 2FA.
- **Secrets:** encrypted at rest, server-only key, never returned in full to
  the client.

## Provider choices (initial)

| Capability   | Provider              | Notes                                   |
| ------------ | ---------------------- | ---------------------------------------- |
| LLM/script   | Claude (Anthropic API) | Script/storyboard structuring            |
| TTS          | ElevenLabs API          | Multi-speaker, per-character billing     |
| Video gen    | Runway                 | Primary adapter; most expensive calls    |
| Image gen    | Flux or Ideogram        | Thumbnails, character sheets, previews   |
| Stock media  | Pexels                 | Cost Saver mode fallback                 |
| Research     | Web search tool         | Researched Mode sourcing                 |

All providers sit behind adapter interfaces (Section 18 of the master
prompt) so a provider swap never touches product code.

## Data model

Follows Section 19 of the master prompt: users/sessions, projects/scenes,
characters/worlds, media_assets, provider_connections, generation_jobs/
job_steps, exports, audit_events. Tables are added as each milestone needs
them rather than all up front — an empty `characters` table with no code
using it is just risk with no benefit.

## Milestones

- **M0 — App shell** *(done)*: Owner auth (email/password + Google, no
  public sign-up), Postgres schema, private-storage-ready structure, static
  11-section dashboard shell with honest empty/placeholder states. No AI
  calls.
- **M1 — Vertical slice** *(in progress)*: idea → script → 1-scene storyboard
  → 1 TTS voice → 1 AI image/video scene → assembled export → downloadable
  package. **Idea → script leg is done**: Create Video has a real form
  (idea/platform/mode), a `ScriptProvider` adapter interface with an
  `AnthropicScriptProvider` implementation (Section 18-style — swapping
  script providers later won't touch this form or the server action), and
  `script`/`generation_job` tables track output and status. Gated honestly —
  if `ANTHROPIC_API_KEY` isn't set, the form says so and disables submit
  rather than faking success. **Script → 1-scene storyboard leg is done**:
  the project detail page can turn the generated script into a single scene
  (narration, a visual-generation-ready description, an estimated duration)
  via a `StoryboardProvider`/`AnthropicStoryboardProvider` adapter mirroring
  the script provider's shape, backed by a new `scene` table (with an
  `order` column so M2's multi-scene breakdown doesn't need a schema
  rework). The scene is manually editable and re-saveable before anything
  downstream uses it, and generation is gated the same honest way as script
  generation. Not yet built: TTS, image/video generation, export, and the
  worker + job queue (still fine to run generation directly in the request
  for now — only needed once a step takes long enough to want to survive a
  browser close).
- **M2**: Multi-scene projects, simple editor, captions, cost-estimate-then-
  confirm flow before any paid generation.
- **M3**: Character Library + consistency test workflow.
- **M4**: World Library + Continuity Checker.
- **M5**: Long-form resilience — resumable/retryable/idempotent scene-by-
  scene rendering.
- **M6**: Provider Hub — add/test/disable connections, fallback rules with
  confirmation before any fallback that changes cost/quality/privacy.
- **M7**: Thumbnail Studio, Brand Kit.
- **M8**: PWA polish, accessibility pass, full test suite (Section 23 of the
  master prompt), security review.

## Credentials needed (not all at once — per milestone)

Anthropic API key · ElevenLabs API key · Runway API key · an image-gen
provider key · Pexels API key · Postgres connection · R2 or S3 keys · Redis
(Upstash, for M1's job queue) · Google OAuth client ID/secret · hosting
(Vercel for web, Railway/Fly.io for worker+Redis).

None of these are needed to run M0 beyond Postgres and Google OAuth — see
the root `README.md` for setup steps.
