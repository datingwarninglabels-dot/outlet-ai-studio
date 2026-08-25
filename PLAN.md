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
| Video gen (animate) | Runway (`gen4_turbo`, image-to-video) | Same account as image gen; 5 credits/sec |
| Video assembly | Shotstack             | Cloud rendering API, not self-hosted ffmpeg — see M1 Assembly note |
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
  → visual → animate → assembled final video → downloadable package, all
  via adapter interfaces
  (`ScriptProvider`/`AnthropicScriptProvider`,
  `StoryboardProvider`/`AnthropicStoryboardProvider`,
  `TTSProvider`/`ElevenLabsTTSProvider`, `ImageProvider`/`RunwayImageProvider`,
  Section 18-style — swapping providers later won't touch product code),
  every generation leg gated by the M1.5 cost gate and job resilience
  machinery.
  - **Voice**: combines every scene's narration into one track
    (Voice Studio's multi-speaker/per-character assignment is Section 13
    scope, not this slice).
  - **Visual**: generates one still image per scene (Runway `gen4_image`,
    text-to-image) — animating these into video via Runway's image-to-video
    endpoint is deferred. One job per generation batch, one `job_step` per
    scene, resumable at scene granularity: a request only targets scenes
    that don't already have a visual, and if a batch fails partway through,
    retry skips the scenes already generated (checked via existing
    `media_asset` rows for that job) rather than re-generating or
    re-charging for them — the clearest real exercise yet of the M1.5 job
    resilience model. Runway's request/response shapes here were verified
    against their published docs (base URL, auth/version headers, endpoint
    bodies, task-polling status values, and `gen4_image` credit pricing)
    rather than assumed from memory, unlike the cost-estimate tables
    elsewhere which are still best-effort approximations. Each scene's
    generation is async (submit → poll → download) and can take up to ~2
    minutes, handled by polling inside the provider call rather than a
    separate UI step — still fine to run in-process for a few scenes, but
    this is the leg most likely to eventually want a real worker if scene
    counts grow.
  - Both require private object storage configured first — generated media
    is copied into R2/S3 via a `StorageProvider`/`S3StorageProvider` adapter
    and only ever served back through short-lived signed URLs, never a
    temporary provider link, per Section 19. New `media_asset` table tracks
    both.
  - **Animate**: turns each scene's existing still image into a 5-10s clip
    via Runway's image-to-video endpoint (`gen4_turbo`) — the same
    resumable-per-scene job pattern as Visual (one job per batch, one step
    per scene, retry skips scenes already animated). A scene needs a visual
    before it's eligible. The source image is passed to Runway as a
    short-lived signed URL (10 min) from private storage, not a public
    link. `runway-client.ts` now holds the shared submit/poll/download
    logic both `RunwayImageProvider` and `RunwayVideoProvider` build on, so
    the two don't duplicate it. Image-to-video's request shape (`promptImage`
    as a plain URL string, `model: gen4_turbo`, `duration: 5 | 10`, shared
    ratio values) and `gen4_turbo` pricing (5 credits/sec, $0.05/sec) were
    verified against Runway's docs the same way as the image leg.
  - **Assembly**: composites every scene's clip (its animation if one
    exists, else the still image), the voice track, and burned-in captions
    into one final MP4 — via a cloud rendering API (Shotstack) rather than
    self-hosted ffmpeg. That choice was deliberate, not a default: bundling
    an ffmpeg binary is a real risk specifically for a serverless deploy
    target (Vercel) — large binary, read-only filesystem outside `/tmp`,
    function execution time limits video encoding can plausibly exceed.
    Shotstack renders over HTTP with no binary/runtime footprint on our
    side, at the cost of a new paid provider ($0.30/min PAYG, verified
    against shotstack.io/pricing, with a free `stage` sandbox for testing —
    `SHOTSTACK_ENV=stage`). Requires every scene to already have a visual;
    there's no partial-coverage mode, since a scene missing a clip would
    leave a gap in the timeline while the audio kept playing over it. One
    Shotstack render call per request — unlike Visual/Animation this isn't
    resumable per scene (nothing meaningful to resume mid-render), so retry
    just resubmits the whole render.
  - **Export**: a free (no new provider cost, so no cost-gate) `.zip`
    download — script, scene list, SRT/VTT captions, voice track, still
    visuals, animated clips, and `final-video.mp4` if one has been
    assembled — via `/api/projects/[id]/export`. Captions (`captions.ts`)
    are one cue per scene, timed from each scene's estimated duration — no
    word-level sync, since there's no speech alignment against the actual
    generated audio. Pure computation, no provider involved, so this is the
    one piece of the whole app actually verified working end to end in this
    environment (ran it directly against sample scene data — cumulative
    timestamps and SRT/VTT formatting both correct) rather than only
    typechecked/built.
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
- **M2**: Thumbnail Studio, Provider Hub, Character Library — three
  independent feature areas the user chose to build in this order, not a
  single coherent slice like M1. (Multi-scene projects, simple editor, and
  cost-estimate-then-confirm — M2's original description — turned out to
  already be fully covered by M1/M1.5.)
  - **Thumbnail Studio** *(done)*: generates several style-variant
    thumbnails (Section 15's faceless/dramatic/clean/news/gaming/curiosity
    styles, pick up to 4 per request) via the existing `ImageProvider`
    (Runway `gen4_image`) at full platform-correct resolution
    (`thumbnailRatioForPlatform` — 1920x1080 or 1080x1920, both valid
    `gen4_image` ratios, no resize step needed). Same resumable-per-item job
    pattern as Visual/Animation, one item per style. Headline text is
    editable and **free** to change — a new `thumbnails` table separates
    the paid AI-generated base image (`media_asset` "thumbnail_base") from
    the composited-with-text version (`media_asset` "thumbnail_composited",
    regenerated via `sharp` — no provider call — whenever headline text
    changes). Includes a CSS-scaled small-size readability preview per
    Section 15. Text overlay (`thumbnail-overlay.ts`) was actually run and
    visually inspected against sample images in this environment (both
    landscape and portrait, including a word-wrap edge case that initially
    overflowed the canvas and was fixed after seeing the real output) —
    not just typechecked, one of the few pieces of this app verified that
    way. Not done: background removal ("when supported" per spec — no
    verified provider support for it yet), safe-zone visualization beyond
    a sensible default text position.
- **M3**: World Library + Continuity Checker.
- **M4**: Long-form resilience — resumable/retryable/idempotent scene-by-
  scene rendering at higher scene counts than tested so far.
- **M5**: Brand Kit.
- **M6**: PWA polish, accessibility pass, full test suite (Section 23 of the
  master prompt), security review.

## Credentials needed (not all at once — per milestone)

Anthropic API key · ElevenLabs API key · Runway API key (image + video) ·
Shotstack API key (assembly) · Pexels API key · Postgres connection · R2 or
S3 keys · Google OAuth client ID/secret · hosting (Vercel for web — no
separate worker/Redis needed for M1, since generation stays in-process and
video rendering is delegated to Shotstack rather than self-hosted).

None of these are needed to run M0 beyond Postgres and Google OAuth — see
the root `README.md` for setup steps.
