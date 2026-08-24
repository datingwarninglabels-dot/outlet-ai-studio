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

const client =
  globalForDb.postgresClient ?? postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client, { schema });
