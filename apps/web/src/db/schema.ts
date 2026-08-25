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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  provider: text("provider"),
  model: text("model"),
  metadata: jsonb("metadata"),
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
