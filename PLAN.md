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
| Image gen    | Runway (`gen4_image`)  | Verified against dev.runwayml.com docs; 5 credits/720p image |
| Video gen    | Runway (`gen4.5`, image-to-video) | Same account as image gen; animation pipeline not built yet |
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
- **M1 — Vertical slice** *(done)*: idea → script → scene breakdown → voice
  → visual → downloadable package, all via adapter interfaces
  (`ScriptProvider`/`AnthropicScriptProvider`,
  `StoryboardProvider`/`AnthropicStoryboardProvider`,
  `TTSProvider`/`ElevenLabsTTSProvider`, `ImageProvider`/`RunwayImageProvider`,
  Section 18-style — swapping providers later won't touch product code),
  every generation leg gated by the M1.5 cost gate and job resilience
  machinery.
  - **Voice**: combines every scene's narration into one track
    (Voice Studio's multi-speaker/per-character assignment is Section 13
    scope, not this slice).
  - **Visual**: generates one still image (Runway `gen4_image`,
    text-to-image) for scene 1 only — per-scene visuals for the rest of the
    list, and animating this into video via Runway's image-to-video
    endpoint, are both deferred. Runway's request/response shapes here were
    verified against their published docs (base URL, auth/version headers,
    endpoint bodies, task-polling status values, and `gen4_image` credit
    pricing) rather than assumed from memory, unlike the cost-estimate
    tables elsewhere which are still best-effort approximations. Generation
    is async (submit → poll → download) and can take up to ~2 minutes,
    handled by polling inside the provider call rather than a separate UI
    step — still fine to run in-process for now (a single slow request, not
    yet the multi-minute-job case that would justify standing up a real
    worker), but this is the leg most likely to outgrow that first.
  - Both require private object storage configured first — generated media
    is copied into R2/S3 via a `StorageProvider`/`S3StorageProvider` adapter
    and only ever served back through short-lived signed URLs, never a
    temporary provider link, per Section 19. New `media_asset` table tracks
    both.
  - **Export**: a free (no new provider cost, so no cost-gate) `.zip`
    download — script, scene list, voice track, visual — via
    `/api/projects/[id]/export`. Explicitly **not** an assembled final
    video; that needs real video compositing (ffmpeg or equivalent), which
    is a large enough, risky enough addition (server runtime/binary
    concerns, especially for a serverless deploy target) that it's worth
    its own milestone rather than folding in here unverified.
- **M1.5 — Job resilience, cost gate, scene breakdown** *(done)*: closed two
  structural gaps from M1 before more (and more expensive) generation types
  build on top of them.
  - **Cost confirmation gate**: no generation call fires until the Owner
    sees an estimated cost and explicitly confirms, via a generic
    request → confirm/cancel flow (`JobConfirmCard`) that both script and
    storyboard generation now go through — image/video/TTS plug into the
    same gate later without rework. Estimates come from a hardcoded,
    clearly-approximate per-model price table (`cost-estimate.ts`) — no live
    pricing API exists.
  - **Job resilience**: `generation_jobs` gained an idempotency key (a
    double-submit resolves to the same job, never a second one),
    `last_heartbeat_at` for stall detection, and a new `job_steps` table for
    step-by-step status. A job stuck `running` past 5 minutes shows as
    stalled with a Retry action that resumes the *same* job — true mid-call
    resumption isn't a coherent concept for a single LLM call, so "resumable"
    here means "detected and safely retryable," not "continues where it left
    off." Transient provider failures (5xx/429/network) get one retry with
    backoff (`withRetry`); failure messages shown to the Owner are sanitized
    (`publicErrorMessage`), never raw provider/SDK text.
  - **Cost tracking**: moved off `generation_jobs` into a dedicated
    `usage_costs` table (estimate, confirmation timestamp, actual cost when
    known) — keeps job orchestration and spend tracking separate, and sets
    up Provider Hub's (M6) per-provider/per-project spend queries without
    another migration later.
  - **Scene breakdown, generalized**: storyboard generation now produces a
    real scene list (2-8 scenes, not a hardcoded single scene), each with
    narration, visual description, **audio direction**, and duration.
    Manually editable and reorderable (up/down, no drag library added yet)
    before anything downstream uses them; edits bump a `version` counter.
    Added an optional `chapters` table for future long-form grouping — schema
    only, not wired into any UI yet, a deliberate extension point.
  - Deliberately **not** done: a real background worker/queue (Redis/BullMQ)
    — execution stays in-process, driven by explicit Owner actions
    (confirm/retry), since every step here is a single-digit-second LLM
    call. Revisit when video generation genuinely needs multi-minute
    out-of-process execution. Also not done: chapter-grouping UI, and
    per-scene visual/voice generation (both explicitly out of scope for this
    slice).
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
