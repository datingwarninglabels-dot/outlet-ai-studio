# Claude Code Master Prompt: Outlet AI Studio

You are the lead product engineer, AI-media architect, security engineer, and UX designer for **Outlet AI Studio**.

Tagline: **Your idea. Your voice. Your outlet.**

Build a production-quality, owner-first AI content-creation web application that combines the best high-level workflows of Higgsfield-style AI video creation and ElevenLabs-style AI audio creation in one beginner-friendly studio. Do not copy proprietary code, branding, layouts, or assets from either company. Build an original product.

## 1. Product outcome

Outlet AI Studio should turn one idea, topic, uploaded script, or research request into a complete faceless-content package:

- Finished video
- Voiceover and mixed audio
- Editable captions and subtitle file
- Platform-ready thumbnail or cover
- Title, description, hashtags, and publishing copy
- Saved project containing all editable scenes and media

The primary use cases are:

- TikTok videos
- YouTube Shorts
- Regular YouTube videos
- Facebook Reels
- Instagram Reels
- Long-form faceless videos lasting up to an hour or more

This first release is for one private Owner. Do not build public customer registration, payments, subscriptions, teams, or social publishing yet.

## 2. Non-negotiable product principles

1. Every visible button must work. Hide incomplete features instead of displaying fake controls or mock success messages.
2. Default workflows must be simple enough for a nontechnical beginner.
3. Advanced settings must be available but collapsed by default.
4. Never start a paid generation without showing the estimated cost and receiving confirmation.
5. Persist progress after every completed step so long projects can resume safely.
6. Uploaded and generated media is private by default.
7. AI provider credentials must remain server-side and encrypted.
8. Use original branding and interface design.
9. Desktop, tablet, and phone layouts must all be fully usable.
10. Meet WCAG-oriented accessibility basics, including keyboard use, visible focus, readable contrast, labels, and 44px touch targets.

## 3. Brand and interface

Use the working product name **Outlet AI Studio** and the tagline **Your idea. Your voice. Your outlet.**

Design direction:

- Premium dark cinematic workspace
- Deep charcoal surfaces
- Purple, blue, and teal lighting accents
- Optional comfortable light mode for scripts and research
- Large media previews and obvious primary actions
- Minimal jargon and plain-language help
- Subtle glass effects only where readability remains excellent
- Responsive, installable Progressive Web App

The home screen combines a dashboard with an AI creation assistant. It should include:

- “What do you want to create?” conversational input
- TikTok, YouTube Short, YouTube Video, Facebook Reel, Instagram Reel, and Custom Project cards
- Continue Recent Project
- Active and completed generation jobs
- Upload Media
- Voice Studio and Thumbnail Studio shortcuts

## 4. Owner authentication and security

Implement one private Owner account with:

- Email and password sign-in
- Google sign-in
- Forgot-password/reset flow
- Optional two-factor authentication, structured so it can become mandatory later
- Permanent Owner role and protected routes
- Session/device list with remote sign-out
- Secure HTTP-only cookies or the safest supported session mechanism
- CSRF, validation, authorization, and rate-limit protection

Never hardcode the Owner password. Provide secure setup instructions and an initial bootstrap flow. Do not ask for or print secrets.

## 5. Core navigation

Show only working sections:

1. Dashboard
2. Create Video
3. Projects
4. Character Library
5. World Library
6. Voice Studio
7. Thumbnail Studio
8. Media Library
9. Brand Kit
10. Provider Hub
11. Settings

Do not show Billing, Credit Purchases, Teams, Collaboration, Invoices, Customer Management, public API keys, or a social publishing calendar in this release.

## 6. Creation modes

Offer three modes:

- **Quick Video:** AI makes sensible choices and creates the project with minimal questions.
- **Guided Video:** the Owner approves the script, storyboard, visuals, voices, and estimated generation cost before rendering.
- **Studio Mode:** complete manual control over scenes and generation settings.

Also provide:

- **Creative Mode:** original stories, entertainment, motivation, and fictional content.
- **Researched Mode:** current web research with source URLs, publication dates, sentence-to-source mapping, uncertainty warnings, conflict detection, a fact-check screen, and source credits for the description.

Research must use trustworthy sources and clearly distinguish facts, inference, and creative writing.

## 7. Conversational Lumen-style assistant

Create an original assistant for Outlet AI Studio. It must coexist with regular controls, not replace them. It should understand commands such as:

- “Make a 45-second Facebook Reel about dating warning signs.”
- “Make the introduction shorter.”
- “Use a warm female narrator.”
- “Replace scene four with stock footage.”
- “Create a dramatic thumbnail with larger text.”
- “Turn this into a 30-second version.”

The assistant must ask only necessary follow-up questions, produce a plan before spending money, summarize proposed changes, and require confirmation before destructive or paid actions.

## 8. Script and storyboard workflow

Users can enter a topic, paste a complete script, upload a script, or request researched writing.

Support:

- Hook and title generation
- Script drafting and rewriting
- Tone, audience, length, and platform settings
- Chapter and scene breakdown
- Per-scene narration, visuals, characters, location, timing, and audio direction
- Estimated runtime and generation cost
- Manual editing before generation
- Versioned autosave

Long-form projects must render scene by scene. Save each completed scene immediately. Jobs must be resumable, retryable, idempotent, and able to continue after a browser closes or a worker restarts. Never represent a simulated timer as real rendering.

## 9. Video and image generation

Build a provider-agnostic generation layer supporting text-to-video, image-to-video, and image generation.

The system should:

- Recommend a model automatically based on quality, speed, cost, character consistency, camera control, reference support, and requested style
- Allow advanced manual model selection
- Label options as Best Quality, Fastest, Lowest Cost, Best for Realistic People, Best for Animation, Best for Camera Motion, or Best for Consistent Characters
- Offer a lower-cost preview before final rendering
- Support aspect ratios appropriate for vertical, square, and landscape content
- Support camera movement, lighting, lens/shot style, motion strength, duration, seed, and reference assets when the provider permits
- Record provider, model, parameters, cost estimate, actual cost, timestamps, status, and failure reason

Never claim a capability that the selected provider does not support.

## 10. Consistent Character Library

Character consistency is an Owner-version requirement.

Users must be able to:

- Create a fictional character from a description
- Upload authorized reference images
- Generate and approve a character sheet with front, side, close-up, and full-body views
- Lock face, skin tone, hair, body type, apparent age, distinguishing details, clothing, accessories, and palette
- Create alternate outfits without changing identity
- Assign a persistent voice
- Reuse a character across scenes and projects
- Run an inexpensive consistency test before full generation

Store approved references, structured appearance data, prompt fragments, negative prompts, provider settings, seeds when useful, and approved outputs.

Support multiple consistent characters in one scene. Track for each character:

- Appearance and outfit
- Assigned voice
- Dialogue
- Position and action
- Emotion
- Interaction notes
- Lip-sync assignment

Before an expensive multi-character render, generate a still preview for approval.

Real-person characters require clear documented permission. Keep reference images private and provide complete deletion controls. Block deceptive public-figure impersonation.

## 11. World Library and continuity

Implement a Project Bible and reusable World Library containing:

- Locations and environment references
- Props and vehicles
- Outfits and accessories
- Lighting and color palette
- Camera and lens style
- Animation or realism style
- Time of day and weather
- Approved reference frames
- Character and voice assignments

Implement a Continuity Checker that compares planned and generated scenes and warns about unexpected changes to faces, hair, clothing, props, locations, lighting, voice, or other locked details. Allow the Owner to approve an intentional change.

## 12. Visual sources and cost-saving logic

Scenes can use:

- AI-generated video or images
- Owner-uploaded photos, art, video, logos, and graphics
- Properly licensed stock photos and footage

Keep source and license metadata for every stock asset. Allow replacement of every automatically selected asset.

Provide:

- **Cost Saver:** favors licensed stock and fewer AI generations
- **Balanced:** mixes stock and original AI media
- **Premium Visuals:** prioritizes original AI scenes

## 13. Voice and audio

The long-term architecture must support:

- Text-to-speech
- Stock voice library
- Multiple speakers and dialogue
- Speech-to-speech
- Personal voice cloning with consent
- Dubbing and translation
- AI sound effects
- AI background music
- Lip-sync
- MP3 and WAV export

For the first Owner release, fully implement real text-to-speech, multiple speakers, sound effects/music integration, audio preview, volume controls, and downloads. Hide any advanced feature that is not truly connected.

Personal voice cloning may be implemented only if consent records, private sample storage, retention controls, and a delete-my-voice workflow are complete. Otherwise hide it for the next build.

Support an English interface with multilingual voice generation, script translation, captions, and dubbing architecture. Provide a future-ready “Localize Video” workflow that can create linked language versions while preserving the original.

## 14. Simple editor

The Owner release is not a full professional nonlinear editor. Implement a reliable simple editor with:

- Reorder scenes
- Trim and split clips
- Delete or replace scenes
- Edit script and on-screen text
- Replace or regenerate a single narration line
- Edit automatic captions
- Adjust narration, music, and sound-effect volume
- Simple transitions
- Aspect-ratio variants
- Preview and export
- “Edit with AI” natural-language commands

Design data structures so a later release can add a multitrack timeline, overlays, keyframes, color grading, speed ramps, masks, background removal, animated text, and detailed audio mixing without a destructive migration.

## 15. Thumbnail and cover studio

Generate platform-ready YouTube thumbnails, Facebook Reel covers, Instagram Reel covers, and TikTok covers.

Features:

- Generate several options from the project’s topic, title, characters, and strongest scene
- Faceless, dramatic, clean, news, gaming, and curiosity styles
- Editable headline text
- Change fonts, colors, images, crop, and layout
- Background removal/replacement when supported
- Readability preview at small size
- Correct export dimensions and safe zones per platform
- Save assets with the project

## 16. Content Package export

When a project is complete, create one downloadable package containing:

- Finished video
- Platform-specific video variants
- Thumbnail and cover assets
- Short and SEO-oriented title options
- Description
- Hashtags
- Burned-in caption version
- Clean video version when available
- SRT or VTT subtitle file
- Source/credit list for researched or stock-based projects
- Audio-only exports when requested

Use background jobs for rendering and packaging. Display real progress based on completed work units.

## 17. Media Library, storage, and Brand Kit

Media Library:

- Upload photos, art, videos, logos, music, sound effects, voice recordings, scripts, and subtitle files
- Validate type, size, and malware risk
- Preview, rename, tag, reuse, download, and delete
- Organize by project and media type
- Compress or transcode safely when useful
- Show storage usage
- Private by default

Storage policy for Owner release:

- Keep files until the Owner deletes them
- Use Trash with a recovery window before permanent deletion
- Allow permanent deletion immediately when explicitly chosen
- Track storage per project
- Make future plan-based limits possible

Brand Kit:

- Logo
- Colors
- Fonts
- Intro and outro
- Caption style
- Watermark preference
- Default voice, music mood, and visual style

Automatically apply approved Brand Kit settings to new projects while allowing project overrides.

## 18. Provider Hub

Support both automatic provider selection and optional personal API connections.

Provider Hub requirements:

- Add, test, disable, and remove provider connections
- Encrypt credentials at rest
- Never return full secrets to the client
- Mask secret display
- Record provider health and last test time
- Show supported capabilities
- Track spending and usage by provider/project
- Support fallback only when the output requirements remain compatible
- Require confirmation before a fallback that materially changes quality, cost, privacy, or model behavior

Create clean adapter interfaces for research, LLM/script, image, video, TTS, music/SFX, stock media, storage, and later social publishing providers.

## 19. Data model and backend reliability

Use a secure relational database and private object storage. Suggested core entities:

- users, identities, sessions, roles
- projects, project_versions, chapters, scenes
- scripts, research_sources, citations
- characters, character_references, outfits, voices
- worlds, locations, props, continuity_rules
- media_assets, asset_licenses, brand_kits
- provider_connections, provider_capabilities
- generation_jobs, job_steps, generation_outputs, usage_costs
- exports, export_variants, trash_items
- audit_events, consent_records

Use migrations, foreign keys, validation, row-level authorization where supported, signed media access, structured audit logs, idempotency keys, retry policies with backoff, job cancellation, and cleanup for abandoned work.

Do not store generated media only at temporary provider URLs. Copy completed outputs into private application storage and use authorized or expiring signed access.

## 20. Progressive Web App

Make the application installable on phones and computers.

- Responsive navigation and studios
- Home-screen icon and manifest
- Safe update behavior
- Useful offline support for script editing and scene organization
- Clear offline states; research, generation, and provider operations require internet
- Notifications for completed or failed generation jobs, with explicit permission

## 21. Watermark architecture

The Owner’s exports never receive a watermark.

Prepare future customer logic so Free Starter exports can receive a small “Made with Outlet AI Studio” watermark that never covers captions or important visuals. Paid customer exports will not have the watermark. Do not build public customer plans in this release.

## 22. Features explicitly excluded from this release

Hide and do not simulate:

- Public customer sign-up
- Subscriptions, payment processing, invoices, and credit packs
- Teams, collaboration, invitations, approvals, and comments
- Social scheduling and automatic publishing
- Publishing calendar
- Native iOS and Android apps
- Professional multitrack timeline and keyframes
- Any voice cloning or digital-presenter feature that lacks complete consent and deletion workflows
- Fake API keys, fake usage, fake projects, fake exports, or fake success states

Future social publishing will reuse audited portions of the MIT-licensed open-source PostPilot project and add YouTube/YouTube Shorts support. Target platforms later are TikTok, YouTube, Facebook, and Instagram only—not X or LinkedIn. Keep this future integration modular, but do not expose it in the Owner release.

## 23. Testing and acceptance criteria

Before calling the release complete:

1. Run formatting, linting, type checks, unit tests, integration tests, production build, and dependency/security checks.
2. Test authentication and authorization failures, password reset, Google sign-in, expired sessions, and Owner-only routes.
3. Test provider secrets never appear in browser responses, logs, errors, source maps, or client bundles.
4. Test create, save, reload, resume, rename, duplicate, and delete project workflows.
5. Test failed, timed-out, canceled, and retried generation jobs.
6. Test a complete short project from idea through downloadable content package.
7. Test a multi-scene project with at least two consistent characters and continuity rules.
8. Test long-form resume after interruption without duplicating completed work.
9. Test media privacy and signed URL expiration.
10. Test phone, tablet, and desktop layouts and keyboard accessibility.
11. Confirm there are no fake buttons or placeholder success states.
12. Document every external service, required credential, expected cost category, and setup step.

## 24. Implementation process

Do not attempt to implement the whole product blindly in one pass.

1. Inspect the existing Lumen Studio codebase if provided.
2. Produce an audit listing reusable code, security risks, mock features, and migration concerns.
3. Propose the final technical architecture, provider adapters, schema, background-job system, storage strategy, and deployment plan.
4. Break work into small milestones with acceptance tests.
5. Get approval before destructive migrations or provider choices that materially affect cost.
6. Implement the secure application shell, authentication, database, private storage, and real project persistence first.
7. Implement one complete vertical slice: idea → script → storyboard → one working video/voice workflow → simple edit → thumbnail → export.
8. Add consistent characters, world continuity, long-form resilience, additional providers, and PWA polish incrementally.
9. Keep a changelog and setup guide updated throughout.

## 25. First response required from Claude Code

Do not start coding immediately. First return:

1. A concise understanding of the product.
2. An audit plan for the existing repository.
3. Recommended stack and why.
4. Proposed architecture and data model.
5. Recommended initial provider choices with cost/security tradeoffs.
6. Milestone plan for the Owner release.
7. Exact credentials or accounts that will eventually be needed, without asking the user to paste secrets into chat.
8. The first small implementation milestone for approval.

Prioritize a secure, honest, working product over a broad collection of nonfunctional screens.
