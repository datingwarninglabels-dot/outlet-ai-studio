import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs } from "@/db/schema";

/**
 * Every generation job type gets one of these. The server action that
 * confirms/retries a job already did the ownership check and the
 * project/character/world narrowing (see getOwnedJob in each actions.ts) —
 * by the time a task runs, `jobId` refers to a job that's already been
 * validated. The task's only responsibility is: re-fetch the current row
 * (never trust a payload snapshot — it may have sat in a queue) and hand it
 * to the same executor function Phase 1 already wrote and tested, which
 * still owns all the actual job_steps/heartbeat/cost bookkeeping.
 *
 * Trigger.dev's own retry (config.retry) intentionally stays off — this
 * app's job model already has its own resumable-per-step retry via
 * job_steps and StalledJobCard, driven by an explicit Owner click, not an
 * automatic re-run. Layering Trigger.dev's automatic retry on top would
 * mean a transient failure silently re-executes the whole job from a fresh
 * task run before the Owner ever sees it failed.
 */
export function defineJobTask<TJob>(config: {
  id: string;
  maxDuration: number;
  executor: (job: TJob) => Promise<string | null>;
}) {
  return task({
    id: config.id,
    maxDuration: config.maxDuration,
    retry: { maxAttempts: 1 },
    run: async (payload: { jobId: string }) => {
      const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, payload.jobId)).limit(1);
      if (!job) {
        throw new Error(`Job ${payload.jobId} not found — it may have been deleted before the task ran.`);
      }

      // executeXJob() returns a sanitized public error string on failure
      // (and has already called failJob() itself) rather than throwing —
      // re-throw here only so it shows up as a failed run in the Trigger.dev
      // dashboard too, not because anything downstream reads this.
      const publicError = await config.executor(job as unknown as TJob);
      if (publicError) {
        throw new Error(publicError);
      }
    },
  });
}
