import { defineConfig } from "@trigger.dev/sdk";

// Phase 2, Milestone 1: generation jobs run as Trigger.dev tasks instead of
// synchronously inside a Next.js server action. See trigger/README.md for
// why (Vercel's function time limits vs. this app's multi-minute polling
// loops for video/assembly jobs) and trigger/lib/job-task.ts for the shared
// task wrapper every job type uses.
//
// `project` must be set to your own project ref from the Trigger.dev
// dashboard (Project settings -> Project ref) before this will run —
// there's no real project behind this placeholder. See README.md's Phase 2
// setup section.
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "<set TRIGGER_PROJECT_REF in your env>",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 3600,
});
