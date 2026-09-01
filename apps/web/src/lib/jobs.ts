import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, jobSteps, usageCosts } from "@/db/schema";
import { requireCredits } from "@/lib/entitlements";
import { checkRateLimit } from "@/lib/rate-limit";

export const STALL_THRESHOLD_MS = 5 * 60 * 1000;

// Every generation request (script, storyboard, voice, visual, animation,
// assembly, thumbnail, character/world images) funnels through requestJob
// below — a single choke point to rate-limit real, billable provider calls
// per account, rather than adding a check at each of the ~10 call sites.
// Generous enough not to bother a real user working through a project
// (many scenes each need their own request), tight enough to stop a
// scripted/bug-driven spam loop.
const JOB_REQUEST_RATE_LIMIT_WINDOW_MINUTES = 10;
const JOB_REQUEST_RATE_LIMIT_MAX_ATTEMPTS = 30;

// Postgres advisory locks are keyed by an arbitrary integer the caller
// picks — this is the 2-int-arg form (namespace, hashtext(ownerId)) so
// only concurrent requests from the SAME owner serialize against each
// other; a different owner hashes to a different second argument and
// proceeds immediately. Namespaced separately from setup/actions.ts's
// bootstrap lock (which uses the single-bigint-arg form — a completely
// separate lock space, so the two can never collide regardless of value).
// A hashtext() collision between two different owners is possible but
// harmless: at worst they occasionally serialize behind each other
// unnecessarily — each still only ever reads/writes its OWN ownerId's
// rows, so a collision can't merge two owners' credit totals.
const CREDIT_CHECK_LOCK_NAMESPACE = 573910284;

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
    ownerId: string;
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
  const allowed = await checkRateLimit({
    scope: "job_request",
    // ownerId is already a stable internal identifier, not raw PII from a
    // request — no need to hash it the way an IP/email is hashed elsewhere.
    key: input.ownerId,
    windowMinutes: JOB_REQUEST_RATE_LIMIT_WINDOW_MINUTES,
    maxAttempts: JOB_REQUEST_RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (!allowed) {
    throw new Error("Too many generation requests. Please wait a few minutes and try again.");
  }

  // Server-side authorization, not a UI nicety — checked here so every
  // generation type is gated consistently through this one choke point,
  // the same way the rate limit above is. Runs on every call including a
  // retried/duplicate submit (idempotencyKey match below) rather than only
  // on first creation — the rare cost is a legitimate retry getting
  // blocked if credits were exhausted by *other* jobs in the meantime,
  // which is an acceptable edge case given the alternative (restructuring
  // around "is this actually a new charge") adds real complexity for it.
  //
  // The check and the inserts below run in ONE transaction, behind a
  // per-owner advisory lock — without this, two concurrent requests near
  // the credit ceiling (two tabs, a scripted burst, or just a double
  // fast-click) could both pass requireCredits() before either commits,
  // together exceeding the plan's allowance. Real provider cost is spent
  // per confirmed job regardless of whether the account was actually
  // entitled to all of it, so this isn't just a display inconsistency —
  // it's real, uncapped spend past what the plan pays for. Same class of
  // check-then-insert race, and the same fix, as setup/actions.ts's
  // bootstrap-lock (see its comment) — just keyed per-owner here instead
  // of a single global lock, since unrelated owners must not block each
  // other.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CREDIT_CHECK_LOCK_NAMESPACE}, hashtext(${input.ownerId}))`);

    await requireCredits(input.ownerId, input.estimatedCostCents, tx);

    const inserted = await tx
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
      const [existing] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (!existing) {
        throw new Error("Failed to create or find job for idempotency key.");
      }
      job = existing;
    } else {
      await tx.insert(usageCosts).values({
        jobId: job.id,
        ownerId: input.ownerId,
        projectId: input.projectId ?? null,
        characterId: input.characterId ?? null,
        worldId: input.worldId ?? null,
        provider: input.provider,
        estimatedCostCents: input.estimatedCostCents,
      });
    }

    return job;
  });
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

/**
 * Records what a completed job actually cost, once it's known — every
 * executor calls this right before completeJob(). Provider Hub's spend
 * view reads usageCosts.actualCostCents; until this existed it was never
 * written by anything, so "actual spend" was always $0 regardless of real
 * generation activity. Best-effort: a failure here shouldn't fail an
 * otherwise-successful job over a bookkeeping write.
 */
export async function recordActualCost(jobId: string, actualCostCents: number): Promise<void> {
  try {
    await db.update(usageCosts).set({ actualCostCents }).where(eq(usageCosts.jobId, jobId));
  } catch (err) {
    console.error(`[jobs] failed to record actual cost for job ${jobId}`, err);
  }
}

/**
 * For job types whose cost is already exact at request time (image/video
 * generation priced per-unit or per-second, TTS priced per already-known
 * character count, assembly priced per already-known scene duration total
 * — see lib/cost-estimate.ts) — there's no real variance between estimate
 * and actual the way there is for an LLM call's token usage, so the
 * estimate already written to usageCosts.estimatedCostCents at job
 * creation IS the actual cost. Copies it over rather than recomputing.
 */
export async function recordActualCostFromEstimate(jobId: string): Promise<void> {
  try {
    const [cost] = await db.select({ estimatedCostCents: usageCosts.estimatedCostCents }).from(usageCosts).where(eq(usageCosts.jobId, jobId)).limit(1);
    if (cost) {
      await db.update(usageCosts).set({ actualCostCents: cost.estimatedCostCents }).where(eq(usageCosts.jobId, jobId));
    }
  } catch (err) {
    console.error(`[jobs] failed to record actual cost (from estimate) for job ${jobId}`, err);
  }
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
