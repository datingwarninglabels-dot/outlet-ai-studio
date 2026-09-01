import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  boolean,
  jsonb,
  uuid,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// --- Auth.js required tables ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  // Defaults to "customer" — every insert that should create an Owner
  // (only setup/actions.ts's bootstrap) sets role explicitly rather than
  // relying on the default, so a Customer/Owner default flip here can't
  // silently promote anything.
  role: text("role").notNull().default("customer"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// --- Product tables (grown milestone by milestone) ---

export const projects = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    platform: text("platform"),
    // Section 17: "automatically apply approved Brand Kit settings to new
    // projects while allowing project overrides." Null means "inherit the
    // Owner's Brand Kit default" (or no default at all); set means "use this
    // instead for this project only."
    visualStyleOverride: text("visual_style_override"),
    voiceIdOverride: text("voice_id_override"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Postgres doesn't auto-index foreign keys (only primary keys) — every
  // owner-scoped list query in the app filters on this column.
  (table) => [index("project_owner_id_idx").on(table.ownerId)],
);

export const scripts = pgTable(
  "script",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status").notNull().default("draft"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("script_project_id_idx").on(table.projectId)],
);

// Optional grouping for long-form projects. Nullable and unused by the
// current single-batch scene breakdown UI — an extension point for M2+
// long-form chapter navigation, not wired up yet.
export const chapters = pgTable("chapter", {
  id: uuid("id").primaryKey().defaultRandom(),
  scriptId: uuid("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scenes = pgTable(
  "scene",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
    // Optional Section 11 wiring: which reusable character/world (if any)
    // this scene's visual should stay consistent with. "set null" (not
    // cascade) on delete — losing the assignment shouldn't delete the scene.
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
    worldId: uuid("world_id").references(() => worlds.id, { onDelete: "set null" }),
    order: integer("order").notNull().default(0),
    narration: text("narration").notNull(),
    visualDescription: text("visual_description").notNull(),
    audioDirection: text("audio_direction"),
    durationSeconds: integer("duration_seconds"),
    status: text("status").notNull().default("draft"),
    provider: text("provider"),
    model: text("model"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Every project detail page loads its scenes by projectId — the
  // highest-traffic query in the whole app.
  (table) => [index("scene_project_id_idx").on(table.projectId)],
);

export const generationJobs = pgTable(
  "generation_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly one of projectId/characterId/worldId is set, enforced in code
    // (not a DB constraint) — most jobs belong to a project; Character/World
    // Library jobs (sheets, consistency tests) belong to that entity instead,
    // since both are reusable across projects and don't have one.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
    worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    // queued | awaiting_confirmation | running | succeeded | failed | cancelled
    status: text("status").notNull().default("queued"),
    params: jsonb("params"),
    // One row per distinct generation request — a retried/duplicate submit
    // resolves to the same job instead of creating a second one.
    idempotencyKey: uuid("idempotency_key").notNull().defaultRandom().unique(),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("generation_job_project_id_idx").on(table.projectId),
    index("generation_job_character_id_idx").on(table.characterId),
    index("generation_job_world_id_idx").on(table.worldId),
    // Enforces at the data layer what requestJob()'s discriminated-union
    // parameter type already enforces at the type layer — that single
    // choke point is the only insert path today, but nothing in the
    // database caught a future bypass (a script, a new code path) until
    // now. See lib/jobs.ts's requestJob().
    check(
      "generation_job_exactly_one_owner_chk",
      sql`num_nonnulls(${table.projectId}, ${table.characterId}, ${table.worldId}) = 1`,
    ),
  ],
);

export const jobSteps = pgTable(
  "job_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull().default(0),
    name: text("name").notNull(),
    // pending | running | succeeded | failed
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(1),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    output: jsonb("output"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Polled repeatedly by JobConfirmCard/StalledJobCard/JobNotifications.
  (table) => [index("job_step_job_id_idx").on(table.jobId)],
);

// Section 19's usage_costs entity, kept separate from generation_job so job
// orchestration and spend tracking don't share one growing row — Provider
// Hub (M6) will want to aggregate this by provider/project on its own.
export const usageCosts = pgTable(
  "usage_cost",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" })
      .unique(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
    worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" }),
    // Billing: who this spend counts against, for summing "credits used
    // this cycle" directly rather than resolving it via a 3-way join
    // through project/character/world on every entitlement check (see
    // lib/entitlements.ts). Stamped by requestJob() at insert time — same
    // reasoning as media_asset.ownerId (Phase 2 Milestone 2): resolving
    // ownership indirectly through a nullable parent is fragile once
    // billing depends on getting it right every time.
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    estimatedCostCents: integer("estimated_cost_cents").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    actualCostCents: integer("actual_cost_cents"),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("usage_cost_project_id_idx").on(table.projectId),
    index("usage_cost_character_id_idx").on(table.characterId),
    index("usage_cost_world_id_idx").on(table.worldId),
    // Entitlement checks sum actual/estimated cost for one owner within a
    // billing period — this is the query that runs on every generation
    // request (lib/jobs.ts's requestJob), so it needs its own index rather
    // than relying on the project/character/world indexes above.
    index("usage_cost_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
    check(
      "usage_cost_exactly_one_owner_chk",
      sql`num_nonnulls(${table.projectId}, ${table.characterId}, ${table.worldId}) = 1`,
    ),
  ],
);

// Generated/uploaded media, copied into private object storage (never left
// at a temporary provider URL) and accessed only via short-lived signed
// URLs — see storage.ts / s3-storage-provider.ts.
export const mediaAssets = pgTable(
  "media_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: character reference/sheet images (Character Library) are
    // reusable across projects, so they aren't tied to one.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    provider: text("provider"),
    model: text("model"),
    metadata: jsonb("metadata"),
    // Section 17 Media Library fields. ownerId is the real per-asset
    // ownership boundary (Phase 2 Milestone 2) — a project-less asset
    // (character/world reference, brand-kit asset, standalone library
    // upload) previously had no owner check at all, which was only safe
    // while this was a single-Owner app. See lib/authz.ts's
    // loadOwnedMediaAsset for the enforcement.
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    tags: jsonb("tags").notNull().default([]),
    // Trash pattern: soft-deleted here, permanently removed (row + storage
    // object) either by an explicit "delete permanently" action or by the
    // lazy recovery-window sweep in media-library/actions.ts — no background
    // job/cron exists in this app (a deliberate M1.5 decision), so the sweep
    // runs opportunistically whenever the Media Library page loads.
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // ownerId is the Media Library's primary filter (every list/aggregate
  // query in media-library/actions.ts); projectId backs the project-scoped
  // filter and the many project-detail-page lookups by projectId.
  (table) => [index("media_asset_owner_id_idx").on(table.ownerId), index("media_asset_project_id_idx").on(table.projectId)],
);

// Tracks the editable headline text separately from the generated image —
// the AI-generated base costs money (media_asset "thumbnail_base"); the
// text-composited version is free to regenerate (sharp overlay, no
// provider call) and is re-derived whenever headlineText changes
// (media_asset "thumbnail_composited", referenced by compositedAssetId).
export const thumbnails = pgTable(
  "thumbnail",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    platform: text("platform").notNull(),
    style: text("style").notNull(),
    headlineText: text("headline_text").notNull().default(""),
    baseAssetId: uuid("base_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    compositedAssetId: uuid("composited_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("thumbnail_project_id_idx").on(table.projectId)],
);

// Reusable across projects (Section 10) — not scoped to one project, only
// to the Owner. appearanceData fields are "locked" attributes referenced
// when building generation prompts, so identity stays consistent across
// separately-generated images.
export const characters = pgTable(
  "character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    face: text("face"),
    skinTone: text("skin_tone"),
    hair: text("hair"),
    bodyType: text("body_type"),
    apparentAge: text("apparent_age"),
    distinguishingDetails: text("distinguishing_details"),
    defaultClothing: text("default_clothing"),
    accessories: text("accessories"),
    palette: text("palette"),
    negativePrompt: text("negative_prompt"),
    // Free-text ElevenLabs voice ID override — there's no Voice Library UI to
    // pick from yet (Section 13), so this just stores whatever ID the Owner
    // has from their ElevenLabs account.
    assignedVoiceId: text("assigned_voice_id"),
    // Real-person permission gate (Section 10): enforced in code
    // (character-actions.ts), not just the schema — isRealPerson=true
    // requires non-empty permissionNotes before the character can be saved.
    isRealPerson: boolean("is_real_person").notNull().default(false),
    permissionNotes: text("permission_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("character_owner_id_idx").on(table.ownerId)],
);

export const characterReferences = pgTable(
  "character_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    // "uploaded" | "front" | "side" | "close_up" | "full_body" | "consistency_test"
    viewType: text("view_type").notNull(),
    source: text("source").notNull(), // "upload" | "generated"
    approved: boolean("approved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("character_reference_character_id_idx").on(table.characterId)],
);

// Reusable across projects (Section 11) — a Project Bible location/setting,
// not scoped to one project, only to the Owner. These fields are "locked"
// the same way character appearance fields are, referenced when building
// generation prompts and later checked by the Continuity Checker.
export const worlds = pgTable(
  "world",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    locationDescription: text("location_description"),
    propsVehicles: text("props_vehicles"),
    outfitsAccessories: text("outfits_accessories"),
    lightingPalette: text("lighting_palette"),
    cameraStyle: text("camera_style"),
    animationStyle: text("animation_style"),
    timeOfDay: text("time_of_day"),
    weather: text("weather"),
    negativePrompt: text("negative_prompt"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("world_owner_id_idx").on(table.ownerId)],
);

export const worldReferences = pgTable(
  "world_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    // "uploaded" | "establishing" | "detail" | "consistency_test"
    viewType: text("view_type").notNull(),
    source: text("source").notNull(), // "upload" | "generated"
    approved: boolean("approved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("world_reference_world_id_idx").on(table.worldId)],
);

// Which characters typically appear in this world — Section 11's "character
// and voice assignments" (voice comes along for free via character.assignedVoiceId,
// no separate field needed here). Pure join, no extra columns yet.
export const worldCharacters = pgTable(
  "world_character",
  {
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (wc) => [primaryKey({ columns: [wc.worldId, wc.characterId] })],
);

// Section 17: one Brand Kit per Owner (this is a single-Owner app, so
// "reusable across projects" means exactly one row, not a library of
// several) — auto-applied to new projects, with project.visualStyleOverride/
// voiceIdOverride letting a specific project opt out. logo/intro/outro are
// media_asset references (private storage, signed URLs, same as every
// other uploaded asset in this app). Deliberately data-only for now on
// fields with no rendering pipeline to consume them yet — see the
// deliberate-scope-limits note in PLAN.md's M5 section.
export const brandKits = pgTable("brand_kit", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  logoAssetId: uuid("logo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  introAssetId: uuid("intro_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  outroAssetId: uuid("outro_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  // ["#RRGGBB", ...] — up to a handful of brand swatches.
  colors: jsonb("colors").notNull().default([]),
  fonts: text("fonts"),
  captionStyle: text("caption_style"),
  watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
  watermarkText: text("watermark_text"),
  // Free-text ElevenLabs voice id, same pattern as character.assignedVoiceId
  // — no Voice Library picker UI exists yet (Section 13).
  defaultVoiceId: text("default_voice_id"),
  defaultMusicMood: text("default_music_mood"),
  // The one field with a real consumer today: appended to every scene's
  // visual generation prompt (executeVisualJob) unless the project sets
  // visualStyleOverride.
  defaultVisualStyle: text("default_visual_style"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Section 11's Continuity Checker: one row per scene visual that was
// checked against its assigned character/world's locked details.
// warnings is empty when nothing looked off — the Owner only needs to act
// on rows with a non-empty list, via acknowledgedAt ("approve an
// intentional change").
export const continuityChecks = pgTable("continuity_check", {
  id: uuid("id").primaryKey().defaultRandom(),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  mediaAssetId: uuid("media_asset_id")
    .notNull()
    .references(() => mediaAssets.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
  worldId: uuid("world_id").references(() => worlds.id, { onDelete: "set null" }),
  // [{ field: string, note: string }]
  warnings: jsonb("warnings").notNull().default([]),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Public landing page waitlist (CTA_MODE === "waitlist"). email has a
// unique constraint so a duplicate signup is idempotent, not an error —
// see (marketing)/actions.ts. ipHash is a salted one-way hash used only for
// rate-limiting repeated submissions — the raw IP is never stored.
export const waitlistSignups = pgTable("waitlist_signup", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  creatorType: text("creator_type"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Billing (Stripe) — one row per user tracks their current subscription
// state. A brand-new user has no row at all here yet; getEntitlement()
// (lib/entitlements.ts) treats "no row" the same as plan="free". A row is
// only created once a Checkout session actually completes (the webhook's
// checkout.session.completed handler upserts it) — never speculatively.
// Kept as its own table rather than columns on `users`, matching the
// existing usage_cost/generation_job split: billing state evolves
// independently of identity and gets its own lifecycle (a user can be
// deleted without deleting billing history, or vice versa in principle).
export const subscriptions = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    // "free" | "pro" | "studio" — see lib/plans.ts's PlanId. Only a webhook
    // handler ever changes this after the row is created; nothing in the
    // app writes it in response to a client request, per the "never trust
    // client-side payment status" requirement.
    plan: text("plan").notNull().default("free"),
    // Mirrors Stripe's own Subscription.status verbatim (active, trialing,
    // past_due, canceled, unpaid, incomplete, incomplete_expired) rather
    // than inventing a parallel vocabulary that could drift out of sync
    // with what Stripe actually reports.
    status: text("status"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("subscription_stripe_customer_id_idx").on(table.stripeCustomerId),
    index("subscription_stripe_subscription_id_idx").on(table.stripeSubscriptionId),
  ],
);

// Generic, cross-cutting rate-limit tracking — one row per attempt. `key`
// is always a salted hash (an email or IP), never a raw identifier, same
// privacy stance as waitlistSignups.ipHash. `scope` namespaces independent
// limits (e.g. "login", "job_trigger") so they can't interfere with each
// other. See lib/rate-limit.ts for the check/record logic.
export const rateLimitEvents = pgTable(
  "rate_limit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("rate_limit_event_scope_key_created_at_idx").on(table.scope, table.key, table.createdAt)],
);
