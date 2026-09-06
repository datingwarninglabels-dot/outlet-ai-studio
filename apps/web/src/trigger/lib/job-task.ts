import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs } from "@/db/schema";

/**
 * Re-fetches a job by id and refuses to hand it back if it's still
 * "awaiting_confirmation" — extracted as its own function (rather than
 * inlined in defineJobTask's `run`) specifically so this security-critical
 * guard can be unit/integration-tested directly, without needing
 * Trigger.dev's own runtime to invoke a wrapped task.
 *
 * Defense-in-depth: the confirmX/retryX server actions are the only
 * callers of .trigger() today and already gate on confirmJob()'s status
 * flip, but that's enforcement by caller discipline, not by the task
 * itself. A job still "awaiting_confirmation" means the Owner/customer
 * never confirmed the cost estimate — never do real, billable provider
 * work against one, no matter what triggered this run. (Any other status —
 * "running" from a legitimate retry, "failed", etc. — is fine; only the
 * unconfirmed state is rejected.)
 */
export async function loadConfirmedJob(jobId: string): Promise<typeof generationJobs.$inferSelect> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error(`Job ${jobId} not found — it may have been deleted before the task ran.`);
  }
  if (job.status === "awaiting_confirmation") {
    throw new Error(`Job ${jobId} has not been confirmed — refusing to execute.`);
  }
  return job;
}

/**
 * Every generation job type gets one of these. The server action that
 * confirms/retries a job already did the ownership check and the
 * project/character/world narrowing (see getOwnedJob in each actions.ts) —
 * by the time a task runs, `jobId` refers to a job that's already been
 * validated. The task's only responsibility is: re-fetch the current row
 * via loadConfirmedJob (never trust a payload snapshot — it may have sat
 * in a queue) and hand it to the same executor function Phase 1 already
 * wrote and tested, which still owns all the actual job_steps/heartbeat/
 * cost bookkeeping.
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
      const job = await loadConfirmedJob(payload.jobId);

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
