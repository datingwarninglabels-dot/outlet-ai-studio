# UX / UI Overhaul — Outlet AI Studio

*Completed 2026-09-06. Eight staged commits on `feat/customer-auth-stripe-billing-e2e`
(`46f177a` → Stage 8), each pushed after `tsc` + `lint` + `build` + `vitest` passed. Test count
184 → 203. No server action, auth rule, paywall check, or job/idempotency flow was changed —
this was a presentation, flow, and additive-feature pass.*

---

## 1. What was wrong with the original app

The engineering was already sound (honest empty states, no fabricated content, server-side
paywall, resumable jobs, clean typecheck/lint, 198 passing tests). What made it read as a
mediocre MVP was almost entirely **presentation and flow**:

- **No shared UI layer.** The `bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal`
  button was hand-copied ~15 times — the exact "generic AI-generated" look. No reusable
  `Button` / `Card` / `Field` / `Alert` / `Badge` / `PageHeader` / `EmptyState`. Two disconnected
  colour systems with no shared component idiom.
- **The core workflow screen** (`projects/[id]`, 758 lines) was an 8-section vertical scroll with
  no pipeline, no progress indication, no "what's next", and ~25 sequential awaited DB reads per
  render.
- **Onboarding dead-ended.** After sign-up you landed on a sparse dashboard whose primary button
  read *"What do you want to create?"* — a question, not an action. No first-run guidance, no
  example.
- **Feedback was inline-text only** — no toasts, success frequently silent.
- **Nav** was 13 flat items; "Thumbnail Studio" / "Voice Studio" were tagged "Soon" but one was
  actually built elsewhere and the other's blurb was stale.
- **Settings** was three read-only fields. No edit-name, no change-password, and **no
  password-reset flow existed anywhere** — a real security/UX gap.
- **Accessibility:** `text-[10px]` labels throughout, colour-only job status, no focus management
  on the mobile off-canvas nav, borderline muted-text contrast.
- **Legal** pages were unstructured "Draft — not final" placeholders.

---

## 2. What was changed (by stage)

| Stage | Change |
|---|---|
| **1 — Design system** | New `src/components/ui/` (Button, Card, Field/Input/Textarea/Select, Alert, Badge, PageHeader, EmptyState, ToastProvider/useToast, useActionToast). Retired the tri-colour gradient for one solid `--accent`; the app now shares the semantic accent tokens marketing already used. `globals.css`: raised muted-text contrast to clear AA on raised surfaces, added `--danger`/`--success`/`--warning` (+ `-soft`) and `--border-strong` tokens. |
| **2 — Navigation** | Nav grouped into **Create / Library / Account** with section labels. Voice Studio & Thumbnail Studio removed from the nav (routes still resolve to an honest "not built yet" page). Mobile off-canvas nav now moves focus in, traps Tab, and restores focus on close. `PageHeader` adopted across the authenticated app. New `lib/labels.ts` + `lib/format.ts`. |
| **3 — Onboarding** | Real first-run dashboard state (3-step "how it works" + "create your first video" / try-an-example). Returning dashboard uses friendly job labels + status badges + relative timestamps. Create Video accepts a prefilled idea (`?idea=`), offers example chips, and shows a numbered "after this" pipeline preview. |
| **4 — Project workflow** | Sticky **pipeline rail** across the top of the project page (Script → … → Thumbnails, each with a derived state + click-to-scroll), backed by a pure `lib/pipeline.ts`. The ~25 sequential DB reads collapse into two `Promise.all` rounds; 7 single-row cost lookups become one `inArray` query. Every generate/confirm/cancel/retry/scene-edit form moved onto the shared components and fires a success toast. Per-project Brand Kit overrides collapsed into a `<details>`. Generated `<img>`/`<video>` got `loading="lazy"` / `preload="none"`. |
| **5 — Libraries & Account** | Characters, Worlds, Media, Brand Kit adopt the shared components + success toasts. **Settings became real**: edit display name, change password (credential accounts only), typed-confirmation delete account (blocked for the Owner). New `settings/actions.ts` + validation schemas; password change is rate-limited. |
| **6 — Auth & password reset** | New `/forgot-password` → `/reset-password` flow: `password_reset_token` table (migration 0022, additive), `lib/password-reset.ts` (hash-at-rest, single-use, 1-hour expiry), `lib/email.ts` (Resend adapter that says so when unconfigured — dev logs the link). No account enumeration; per-email rate limit. Login/register/setup forms moved onto the shared components; login gained a "Forgot password?" link. `README.md` security notes corrected. |
| **7 — Marketing / legal / metadata** | Marketing was already solid, so: header nav highlights the in-view section (IntersectionObserver), legal pages got a visible "Last updated" date + the draft notice as a proper `Alert` + consistent heading/link styling. The authenticated `(app)` route group and the login/register/setup pages are now `robots: noindex`. |
| **8 — QA** | Swept the remaining detail screens (character/world detail pages, reference cards, media cards, pricing card, paywall, PWA update prompt) onto the shared components. Removed the last gradient button and the last `text-[10px]` interface labels; status colours replaced with tokens. |

---

## 3. Major UX improvements

- **Onboarding has a path.** First-run users see how the product works and get one click to a
  working example, instead of an empty page and a rhetorical question.
- **The project page has a spine.** The pipeline rail answers "where am I / what's next" at a
  glance and lets you jump straight to the actionable step.
- **Every action confirms itself.** Toasts on success, inline `Alert`s on failure — no more
  silent completions.
- **Navigation is scannable.** Three labelled groups instead of a 13-item flat list; nothing in
  the nav that isn't a real, working tool.
- **Account management exists.** Name, password, and account deletion are all self-serve now,
  plus a full password-reset flow for locked-out users.

## 4. Major UI improvements

- One component set and one accent colour across both the app and marketing — the "collection of
  screens" feeling is gone.
- Consistent page headers, card construction, radii, control heights (44px everywhere), and
  spacing rhythm.
- The tri-colour gradient — the single biggest "AI-generated site" tell — is gone.
- Type hierarchy: real page-title sizing, `font-semibold` section headers, no sub-12px text in
  the interface.

## 5. Technical improvements

- `lib/pipeline.ts`, `lib/labels.ts`, `lib/format.ts` — pure, tested derivation logic shared
  between server and client instead of re-implemented per screen.
- Project-detail data fetching: ~20 sequential awaits → 2 `Promise.all` rounds + a single
  `inArray` cost query.
- `useActionToast` hook centralises server-action success feedback (one place, ~15 call sites).
- `Field` wires `id` / `aria-invalid` / `aria-describedby` once for every form control.
- Additive `password_reset_token` migration; `lib/email.ts` isolates the one email provider
  behind an `isConfigured()` gate, matching every other provider in the app.

## 6. Bugs fixed

- Mobile off-canvas nav had no focus management (focus stayed on the page behind it, Tab escaped
  the panel). Now traps focus and restores it on close.
- Colour-only job status (red/teal text) — now a `Badge` with a status dot, so status isn't
  conveyed by colour alone.
- `README.md` claimed "no public sign-up" and "Google sign-in only for the Owner" — both false
  since customer auth shipped. Corrected.
- The `(app)` route group and one-time auth flows were indexable by search engines. Now
  `noindex`.
- Generated media caused layout shift (`<img>`/`<video>` with no sizing hint). Added
  `loading="lazy"` / `preload="none"` and fixed aspect wrappers.

## 7. Performance / accessibility

- **Performance:** the project page's DB round-trips roughly halved (2 batched rounds vs. ~20
  serial); signed-URL generation parallelised; media thumbnails lazy-load; videos no longer
  preload.
- **Accessibility:** every interactive control ≥ 44px; no sub-12px interface text; `Field`
  provides `aria-invalid` + `aria-describedby`; `Alert` sets `role` by tone; focus-visible ring
  on every control via a token; mobile nav focus trap; status never colour-only; muted-text
  contrast raised to clear WCAG AA on both surface levels.

## 8. Tests / checks performed

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` — all green after every stage.
- Test count **184 → 203** (+19): `lib/labels` (4), `lib/format` (4), `lib/pipeline` (6, unit),
  `lib/password-reset` (5, PGlite-backed integration).
- **Browser-verified** (dev server, no database — so limited to DB-free routes): `/legal/*`
  render correctly in the marketing palette with the new `Alert` and "Last updated" line;
  `/forgot-password` and `/reset-password` (invalid-token state) render correctly with the new
  `Button` / `Field` / `Alert`, at desktop and at 375px mobile — no horizontal scroll, correct
  focus order, full-width controls.

## 9. Still needs attention

- **No live database in this environment**, so the authenticated app (dashboard, Create Video,
  the project pipeline, libraries, Settings, billing) and the credential/Google sign-in flows
  were verified by `build` + `tsc` + `lint` + unit/integration tests only, not clicked through
  in a browser. This matches the project's pre-existing verification posture — see
  `PRODUCTION_DEPLOYMENT_CHECKLIST.md`. **First thing to do with a real `DATABASE_URL`:** walk
  setup → login → dashboard first-run → create-video → project pipeline → settings
  (change-password, delete-account) → forgot-password → reset-password end to end.
- **Password-reset email** needs `RESEND_API_KEY` + `EMAIL_FROM` to actually send (dev logs the
  link). Untested against the real Resend API.
- **Launch blockers from `PRODUCTION_DEPLOYMENT_CHECKLIST.md` remain** and are out of scope for a
  UX pass: `CTA_MODE` still `"waitlist"`, real `SITE_URL`, real Stripe / Trigger.dev / DB
  credentials, credit-allowance and Stripe Price ID values.
- **Line endings:** files written during this work are LF; the repo has no `.gitattributes`, so
  Git will renormalise them to CRLF on next checkout (cosmetic, no functional effect).
- Two previously-untracked docs (`PRODUCTION_DEPLOYMENT_PLAN.md`, `PROJECT_SUMMARY.md`) were
  swept into the Stage 1 commit by a broad `git add`. They are legitimate project docs; flagging
  it for transparency.

## 10. Recommended next improvements, ranked by impact

1. **Stand up a database and do the end-to-end walk above.** Nothing else can be trusted as
   "done" until the authenticated flows run for real once.
2. **Wire the Resend email** and test a real reset round-trip.
3. **Scene-level progressive disclosure on the project page** — the pipeline rail is in; the next
   step is collapsing completed sections to a summary row and expanding only the current step, so
   a 10-scene project isn't a wall of forms.
4. **Optimistic UI on scene edits and reorder** — right now every save is a full server round
   trip + revalidate; the scene list visibly re-renders.
5. **A real toast for the paywall / out-of-credits case** on the generate buttons (currently
   inline `Paywall` only).
6. **Marketing section consolidation** — six sections (UnifiedStudio, Workflow, Features,
   CharactersWorlds, OutputFormats, ContentPackage) cover overlapping "what it does" ground and
   could tighten to three without losing a single truthful claim.
7. **`.gitattributes`** with `* text=auto eol=lf` to stop the CRLF churn.
