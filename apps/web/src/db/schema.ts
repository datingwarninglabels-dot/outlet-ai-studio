import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  boolean,
  jsonb,
  uuid,
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
  role: text("role").notNull().default("owner"),
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

export const projects = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  platform: text("platform"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scripts = pgTable("script", {
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
});

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

export const scenes = pgTable("scene", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
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
});

export const generationJobs = pgTable("generation_job", {
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
});

export const jobSteps = pgTable("job_step", {
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
});

// Section 19's usage_costs entity, kept separate from generation_job so job
// orchestration and spend tracking don't share one growing row — Provider
// Hub (M6) will want to aggregate this by provider/project on its own.
export const usageCosts = pgTable("usage_cost", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => generationJobs.id, { onDelete: "cascade" })
    .unique(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
  worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  estimatedCostCents: integer("estimated_cost_cents").notNull(),
  confirmedAt: timestamp("confirmed_at"),
  actualCostCents: integer("actual_cost_cents"),
  currency: text("currency").notNull().default("usd"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Generated/uploaded media, copied into private object storage (never left
// at a temporary provider URL) and accessed only via short-lived signed
// URLs — see storage.ts / s3-storage-provider.ts.
export const mediaAssets = pgTable("media_asset", {
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tracks the editable headline text separately from the generated image —
// the AI-generated base costs money (media_asset "thumbnail_base"); the
// text-composited version is free to regenerate (sharp overlay, no
// provider call) and is re-derived whenever headlineText changes
// (media_asset "thumbnail_composited", referenced by compositedAssetId).
export const thumbnails = pgTable("thumbnail", {
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
});

// Reusable across projects (Section 10) — not scoped to one project, only
// to the Owner. appearanceData fields are "locked" attributes referenced
// when building generation prompts, so identity stays consistent across
// separately-generated images.
export const characters = pgTable("character", {
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
});

export const characterReferences = pgTable("character_reference", {
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
});

// Reusable across projects (Section 11) — a Project Bible location/setting,
// not scoped to one project, only to the Owner. These fields are "locked"
// the same way character appearance fields are, referenced when building
// generation prompts and later checked by the Continuity Checker.
export const worlds = pgTable("world", {
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
});

export const worldReferences = pgTable("world_reference", {
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
});

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
