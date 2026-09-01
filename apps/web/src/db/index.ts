import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Next.js dev-mode hot reload re-evaluates this module on every change; without
// caching the client on `globalThis`, each reload opens a new connection pool
// on top of the still-open old one.
const globalForDb = globalThis as unknown as { postgresClient?: ReturnType<typeof postgres> };

// max: 1 — on a serverless host (Vercel), every concurrent/cold-started
// function instance gets its own module scope and therefore its own pool.
// The `postgres` package's own default (max: 10, idle_timeout: null) means
// N concurrent instances would open up to 10*N connections that are never
// proactively released — enough real concurrent traffic exhausts a managed
// Postgres provider's connection cap and takes the whole app down at once.
// One connection per instance, reused warm-to-warm via the globalThis cache
// below, keeps total connections bounded by actual concurrency instead of
// by this constant. This still assumes DATABASE_URL points at a pooler
// (Supabase's 6543 pooler port, Neon's pooled endpoint, or PgBouncer) for
// production — `prepare: false` makes the client *compatible* with one but
// doesn't provide pooling on its own; see .env.example's DATABASE_URL note.
const client =
  globalForDb.postgresClient ?? postgres(connectionString, { prepare: false, max: 1, idle_timeout: 20 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client, { schema });
