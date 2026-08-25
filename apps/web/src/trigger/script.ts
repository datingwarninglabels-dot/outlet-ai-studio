import { db } from "@/db";
import { generationJobs, scripts } from "@/db/schema";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { scriptProvider } from "@/lib/providers";
import { defineJobTask } from "./lib/job-task";

// Moved out of projects/[id]/actions.ts (Phase 2, Milestone 1) so this can
// run as a Trigger.dev task instead of synchronously inside the server
// action that confirmed it — see trigger/lib/job-task.ts for why. actions.ts
// only imports scriptJobTask now; nothing here imports from actions.ts, so
// the dependency stays one-directional (a circular actions.ts <-> trigger/
// import broke Next.js's "use server" module boundary the first time this
// was tried).
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

export async function executeScriptJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "generate_script", 0);

  try {
    const params = job.params as { idea: string; platform: string; mode: "quick" | "guided" | "studio" };
    const result = await withRetry(() => scriptProvider.generate(params));

    await db.insert(scripts).values({
      projectId: job.projectId,
      content: result.content,
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      status: "draft",
    });

    await completeStep(stepId, {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });
    await completeJob(job.id);
    return null;
  } catch (err) {
    const publicMsg = publicErrorMessage(err);
    await failStep(stepId, publicMsg);
    await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return publicMsg;
  }
}

export const scriptJobTask = defineJobTask<ProjectJob>({
  id: "execute-script-job",
  maxDuration: 120,
  executor: executeScriptJob,
});
