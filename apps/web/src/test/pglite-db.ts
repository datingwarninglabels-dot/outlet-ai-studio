// A genuinely real Postgres instance (PGlite — WASM Postgres, not a fake/
// stub), used so integration tests exercise real schema constraints (CHECK
// constraints, foreign keys, unique constraints), real queries, and real
// transactions — not mocked DB calls. Every one of this project's 21
// committed migration files is replayed against it in order, the same SQL
// that would run against a real deployment's Postgres.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

export async function createTestDb() {
  const client = new PGlite();

  // PGlite's default session TimeZone is NOT UTC (observed: "Etc/GMT+8",
  // i.e. UTC-8) — unlike virtually every real production Postgres, which
  // defaults its session TimeZone to UTC. This schema uses `timestamp`
  // columns (without time zone) throughout, so `defaultNow()` stores
  // whatever wall-clock reading the session TimeZone produces, with no UTC
  // conversion, and the driver reads that naive value back as if it WERE
  // UTC — an 8-hour skew that would silently corrupt timestamp comparisons
  // (billing cycle boundaries, credit-usage windows, etc.) in THIS test
  // harness only. Force UTC here so the harness matches real deployment
  // behavior instead of masking/duplicating a bug production doesn't have.
  await client.exec(`set time zone 'UTC'`);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    // Drizzle's own convention for separating multiple statements within
    // one migration file — not real SQL, strip it before executing.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.exec(statement);
    }
  }

  const db = drizzle(client, { schema });
  return { db, client };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
