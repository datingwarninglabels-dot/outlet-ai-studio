import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, jobSteps, usageCosts } from "@/db/schema";

export const STALL_THRESHOLD_MS = 5 * 60 * 1000;

export function isStalled(job: { status: string; lastHeartbeatAt: Date }): boolean {
  return job.status === "running" && Date.now() - job.lastHeartbeatAt.getTime() > STALL_THRESHOLD_MS;
}

/**
 * Creates a job awaiting the Owner's cost confirmation, or returns the
 * existing one if this exact request (by idempotency key) was already
 * submitted — a double-click or retried form submit never creates a second
 * job. The cost estimate is written once, on first creation only.
 */
export async function requestJob(
  input: {
    type: string;
    provider: string;
    model: string | null;
    idempotencyKey: string;
    params: unknown;
    estimatedCostCents: number;
  } & (
    | { projectId: string; characterId?: undefined; worldId?: undefined }
    | { characterId: string; projectId?: undefined; worldId?: undefined }
    | { worldId: string; projectId?: undefined; characterId?: undefined }
  ),
) {
  const inserted = await db
    .insert(generationJobs)
    .values({
      projectId: input.projectId ?? null,
      characterId: input.characterId ?? null,
      worldId: input.worldId ?? null,
      type: input.type,
      provider: input.provider,
      model: input.model,
      status: "awaiting_confirmation",
      params: input.params,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: generationJobs.idempotencyKey })
    .returning();

  let job = inserted[0];

  if (!job) {
    const [existing] = await db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) {
      throw new Error("Failed to create or find job for idempotency key.");
    }
    job = existing;
  } else {
    await db.insert(usageCosts).values({
      jobId: job.id,
      projectId: input.projectId ?? null,
      characterId: input.characterId ?? null,
      worldId: input.worldId ?? null,
      provider: input.provider,
      estimatedCostCents: input.estimatedCostCents,
    });
  }

  return job;
}

/** Idempotent: confirming an already-running/succeeded job is a no-op. */
export async function confirmJob(jobId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error("Job not found.");
  }
  if (job.status !== "awaiting_confirmation") {
    return job;
  }

  await db
    .update(generationJobs)
    .set({ status: "running", lastHeartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
  await db.update(usageCosts).set({ confirmedAt: new Date() }).where(eq(usageCosts.jobId, jobId));

  return { ...job, status: "running" as const };
}

export async function cancelJob(jobId: string) {
  await db
    .update(generationJobs)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, "awaiting_confirmation")));
}

/** Retryable: re-running a stalled job's step resumes the same step/attempt count, not a new job. */
export async function startStep(jobId: string, name: string, stepIndex: number): Promise<string> {
  const [existing] = await db
    .select()
    .from(jobSteps)
    .where(and(eq(jobSteps.jobId, jobId), eq(jobSteps.stepIndex, stepIndex)))
    .limit(1);

  await touchHeartbeat(jobId);

  if (existing) {
    await db
      .update(jobSteps)
      .set({
        status: "running",
        attempt: existing.attempt + 1,
        startedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(jobSteps.id, existing.id));
    return existing.id;
  }

  const [step] = await db
    .insert(jobSteps)
    .values({ jobId, name, stepIndex, status: "running", startedAt: new Date() })
    .returning();
  return step.id;
}

/**
 * Persists partial progress on a still-running step without completing it —
 * e.g. a submitted-but-not-yet-finished render id (M4), so a retry after a
 * stall/crash can resume polling the SAME provider job instead of
 * resubmitting (and re-paying for) a brand new one.
 */
export async function updateStepOutput(stepId: string, output: unknown) {
  await db.update(jobSteps).set({ output, updatedAt: new Date() }).where(eq(jobSteps.id, stepId));
}

export async function getStepOutput(stepId: string): Promise<unknown> {
  const [step] = await db.select({ output: jobSteps.output }).from(jobSteps).where(eq(jobSteps.id, stepId)).limit(1);
  return step?.output ?? null;
}

export async function completeStep(stepId: string, output?: unknown) {
  await db
    .update(jobSteps)
    .set({ status: "succeeded", completedAt: new Date(), output: output ?? null, updatedAt: new Date() })
    .where(eq(jobSteps.id, stepId));
}

export async function failStep(stepId: string, error: string) {
  await db
    .update(jobSteps)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(jobSteps.id, stepId));
}

export async function touchHeartbeat(jobId: string) {
  await db
    .update(generationJobs)
    .set({ lastHeartbeatAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

export async function completeJob(jobId: string) {
  await db
    .update(generationJobs)
    .set({ status: "succeeded", updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

/** publicMessage is shown to the Owner — never pass raw provider error text to it. */
export async function failJob(jobId: string, publicMessage: string, internalError: string) {
  await db
    .update(generationJobs)
    .set({ status: "failed", error: publicMessage, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
  console.error(`[job ${jobId}] ${internalError}`);
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" && RETRYABLE_STATUS_CODES.has(status);
  }
  // No status field usually means a network-level failure, not a validation
  // error from the provider — worth one retry. Only wrap actual provider
  // calls with this, not surrounding business logic.
  return true;
}

/** Wrap a single provider call — not surrounding DB writes — to retry transient failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

/** Never surface provider internals (headers, request ids, raw messages) to the Owner. */
export function publicErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return "The configured API key was rejected. Check your provider credentials in the environment.";
    }
    if (status === 429) {
      return "The provider is rate-limiting requests right now. Try again in a moment.";
    }
    if (typeof status === "number" && status >= 500) {
      return "The provider had a temporary problem. Try again.";
    }
  }
  return "Generation failed unexpectedly. Try again — check the server logs if it keeps happening.";
}
