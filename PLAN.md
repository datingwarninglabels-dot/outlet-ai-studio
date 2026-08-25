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
  - **Provider Hub** *(v1 done)*: makes the nav item real — shows every
    provider slot (Anthropic, ElevenLabs, Runway, Shotstack, storage), what
    each does, whether it's currently configured, and actual spend so far
    (reusing the `usage_costs` data every generation leg already writes —
    grouped by provider, scoped to the Owner via the `projects` join).
    **Deliberately scoped down** from the full Section 18 spec: credentials
    are still environment-variable-only, clearly labeled as such on the
    page. Section 18 also wants add/test/disable/remove through the UI with
    encrypted-at-rest storage overriding env vars — that would mean making
    every provider's `isConfigured()`/credential access async and DB-backed,
    which touches every call site across every generation leg's UI and
    actions (7+ files). Given that blast radius, it's worth its own focused
    pass rather than folding into this one silently under the same feature
    name.
  - **Character Library** *(v1 done — M2 complete, all three areas shipped)*:
    reusable characters with locked appearance fields (face, skin tone,
    hair, body type, apparent age, distinguishing details, default
    clothing, accessories, palette, negative prompt) plus an assigned
    voice ID for future TTS integration. Reference images can be uploaded
    or generated as a 4-view sheet (front/side/close-up/full-body) via
    Runway's `referenceImages` parameter once at least one reference is
    approved, for stronger identity consistency; a cheap single-image
    consistency test exists to sanity-check a locked appearance before
    spending on a full sheet. Real-person characters require permission
    notes before saving (zod `.refine` cross-field validation) — this app
    targets faceless/AI content, so a real person's likeness needs an
    explicit, recorded justification, not a silent default. Same
    cost-confirmation gate and resumable-per-view job pattern as every
    other generation leg. Required making `generation_jobs`/`usage_costs`/
    `media_assets.projectId` nullable so jobs/costs/media can belong to
    EITHER a project OR a character (`characterId` added alongside,
    exactly one set, enforced in code not a DB constraint) — caught and
    fixed a design bug before it ever touched a real database, where an
    early draft reused `generation_jobs.projectId` to hold a character's
    UUID, which would have thrown a foreign-key violation at runtime.
    Verified via `npm run build` (TypeScript strict, zero errors) and
    `npm run lint`, both clean; not live-tested against a real database
    (sandbox blocks raw TCP to Postgres in this environment) — migrations
    hand-reviewed as additive/nullable-only. Not done: characters aren't
    yet wired into scene/visual generation (a separate integration to
    pull character references into per-scene image prompts); Provider
    Hub's spend rollup still joins `usage_costs` to `projects` only, so
    character-scoped spend doesn't appear there yet.
- **M3 — World Library + Continuity Checker** *(done)*:
  - **World Library**: reusable settings mirroring Character Library's
    architecture — locked location, props/vehicles, typical outfits/
    accessories, lighting/color palette, camera/lens style, animation/
    realism style, time of day, weather, negative prompt. Reference images
    upload or generate (establishing + detail pair via Runway
    `referenceImages`, plus a cheap consistency test), approve/reject the
    same way. Character assignments (`world_character` join table) track
    which characters typically appear in a world — voice comes along for
    free via `character.assignedVoiceId`, no separate field needed.
  - **Scene assignment**: `scene.characterId`/`worldId` (nullable,
    set-null on delete) let a scene opt into a character and/or world.
    Visual generation for an assigned scene appends the locked
    appearance/setting details to the prompt and passes the character's/
    world's approved reference image to Runway (tagged IDENTITY/SETTING),
    the same mechanism Character/World Library's own reference generation
    already uses.
  - **Continuity Checker**: after an assigned scene's visual generates, a
    Claude Sonnet vision call (`lib/continuity-checker.ts`) compares the
    image against the same locked-details text used to build the prompt
    and returns a strict-JSON list of mismatches (faces, hair, clothing,
    props, locations, lighting, per Section 11). Warnings surface under
    the scene's visual with an "Approve — this change was intentional"
    action (`continuityChecks.acknowledgedAt`). Best-effort by design —
    wrapped in its own try/catch after the visual is already uploaded, so
    a missing `ANTHROPIC_API_KEY` or a failed vision call never
    invalidates an already-successful, already-paid-for image generation.
    Cost is bundled into the same visual-generation confirm step rather
    than a second gate, via `estimateContinuityCheckCostCents()` — openly
    labeled as an approximate flat estimate, since Claude's image
    tokenization by resolution wasn't precisely verified here.
  - `characterAppearanceSummary()`/`worldSettingSummary()` were factored
    out of `buildCharacterPrompt`/`buildWorldPrompt` so the same
    locked-details text feeds character/world reference generation, the
    scene visual prompt, *and* the continuity check itself — the checker
    is always comparing against exactly what was asked for, not a
    separately-maintained description.
  - Verified: `npm run build` (TypeScript strict, zero errors — both
    migrations generated cleanly on the first pass, reviewed as purely
    additive) and `npm run lint`, both clean. Not live-tested (same
    sandbox DB limitation as the rest of this project; no real vision
    round-trip exercised either).
  - Deliberately out of scope: multi-character-per-scene (Section 10 asks
    for support beyond one character per scene — position/action/emotion/
    lip-sync per character); the pre-render still-preview step Section 10
    also asks for; any UI to browse historical/acknowledged continuity
    checks (only the latest open one per scene surfaces).
- **M4 — Long-form resilience** *(done)*: resumable/retryable/idempotent
  scene-by-scene rendering at higher scene counts than tested so far.
  - **Storyboard generation** was the actual blocker for everything else in
    this milestone — the prompt capped scenes at "usually 2-8" and
    `max_tokens: 2048` meant a long-form attempt would either get
    compressed to fit or silently truncated mid-JSON-array and crash the
    whole (paid) generation. Fixed: removed the artificial cap so scene
    count scales with script length, raised `max_tokens` to 8192 (Claude
    bills by actual tokens generated, not this ceiling, so raising it costs
    nothing for short scripts), and added a string-aware truncation-tolerant
    parser that recovers the longest valid prefix of complete scenes when
    the response still hits the ceiling (checked via `stop_reason ===
    "max_tokens"`) rather than throwing the whole thing away. Actually
    tested the recovery logic against 7 cases in isolation before wiring it
    in (including narration text containing literal `{`/`}` characters,
    which a naive brace-counter gets wrong) — caught a real depth-tracking
    bug this way. The UI surfaces `truncated: true` with a regenerate
    button; regenerating now correctly replaces the existing scene list
    (`executeStoryboardJob` didn't handle "scenes already exist" before,
    since the old UI only ever offered regenerate when there were none).
    Cost estimate now scales with script length instead of a flat
    assumption, so long-form requests get an honest pre-confirmation
    number.
  - **Assembly (Shotstack)** was the one generation leg that wasn't
    actually idempotent on retry — a stall/crash mid-render meant retry
    resubmitted (and re-paid for) an entire new render. Fixed by splitting
    `VideoAssemblyProvider.assemble()` into `submitRender()`/
    `pollAndDownload()`; the render id is persisted to the job step's
    output immediately after submission (new `updateStepOutput`/
    `getStepOutput` helpers in `jobs.ts`), so a retry resumes polling the
    *same* render instead of starting a new one. This also means a poll
    that simply times out (more likely as total render time grows with
    scene count) now recovers for free on retry rather than needing an
    expensive resubmit.
  - **Voice generation was checked and found not to need chunking**: verified
    against ElevenLabs' docs that `eleven_turbo_v2_5` (the model already in
    use) accepts up to 40,000 characters per request — roughly 40 minutes
    of audio, far beyond what this app would realistically produce even at
    high scene counts. Deliberately did not add chunking/concatenation
    complexity to solve a gap that verification showed doesn't actually
    exist at this app's scale; worth re-checking only if the app ever
    targets multi-hour narration.
  - Verified: `npm run build` (TypeScript strict, zero errors) and `npm run
    lint`, both clean, no schema changes needed. Not live-tested — same
    sandbox limitation as the rest of this project; no real long-form
    generation or Shotstack render has been exercised here.
- **M5 — Brand Kit** *(done)*: one reusable identity per Owner (single-Owner
  app, so "reusable across projects" means one `brand_kit` row, unique on
  `ownerId`, not a library of several) — logo/intro/outro uploads, up to 6
  hex color swatches, fonts, caption style, watermark, default voice ID,
  default music mood, default visual style. "Automatically apply ... while
  allowing project overrides" (Section 17) is real behavior: `project`
  gained nullable `visualStyleOverride`/`voiceIdOverride`; visual generation
  appends the effective visual style to every scene's image prompt and
  voice generation passes the effective voice ID to ElevenLabs (which
  previously had no per-project voice selection at all — only a single
  env-var default for the whole app). A compact form on the project page
  shows what it's currently inheriting and lets the Owner set/clear either
  override. **Deliberately data-only** for logo/intro/outro/watermark/
  captionStyle/fonts — no consumer yet, clearly labeled in the UI. Burning
  a watermark, splicing an intro/outro, or styling captions in Assembly is
  real Shotstack API surface that needs the same verify-before-claiming-
  support treatment Runway/Shotstack got originally, not a rushed guess;
  only wired what had a direct, already-verified integration point
  (prompt text, an existing provider parameter). Verified: `npm run build`
  (zero TS errors) and `npm run lint`, both clean; migration additive.
  Not live-tested — same sandbox limitation as the rest of this project.
- **Media Library** *(done — closes the gap flagged above)*: a single
  browser over every `media_asset` in the app — generated (scene images/
  video, voice tracks, thumbnails, character/world references, brand kit
  assets, final videos) and directly uploaded — filterable by project and
  category. No `ownerId` column needed: single-Owner, bootstrap-locked app,
  so every authenticated request already is the Owner. Direct upload now
  covers the file types Section 17 lists that the app couldn't ingest at
  all before: photos, art, videos, logos, music, sound effects, voice
  recordings, scripts (.txt/.md), subtitle files (.srt/.vtt) — a new
  `library_upload` media type, category in `metadata`. Preview per type
  (image/video/audio inline), rename, tag, download, and "reuse" (reassign
  a standalone upload's project). Trash with a 30-day recovery window,
  enforced lazily on page load (`sweepExpiredTrash()`) since this app has
  no background job/cron. Storage usage: total + per-project breakdown.
  **Caught before shipping**: "reuse" (reassigning `projectId`) and Trash
  are only safe on standalone uploads — a scene's image, a thumbnail, a
  character reference, etc. are looked up directly by their own pages via
  `mediaAssets`, and none of those lookups check `deletedAt` or expect
  `projectId` to change out from under a `jobId`/`sceneId` they still
  reference. Restricted both actions (server-side guard + hidden in the
  UI) to `type === "library_upload"`; generated media is
  browsable/downloadable here but managed from its own page. Deliberately
  out of scope: real malware/virus scanning (type/size checks only, same
  as every other upload path in this app), compression/transcoding (no
  ffmpeg in this app's architecture, same reasoning as the Assembly
  provider choice), plan-based storage limits (no billing/plan system
  exists yet to attach them to). Verified: `npm run build` (TypeScript
  strict, zero errors) and `npm run lint`, both clean — build initially
  failed on a Next.js "use server" export rule (a plain constant can't be
  exported from a server-actions file), fixed by moving it to
  `lib/media-categories.ts`. Migration additive. Not live-tested.
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
