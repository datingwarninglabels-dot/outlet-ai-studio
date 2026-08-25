import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, scenes, scripts } from "@/db/schema";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { storyboardProvider } from "@/lib/providers";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

export async function executeStoryboardJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "generate_storyboard", 0);

  try {
    const params = job.params as { scriptId: string; platform: string };
    const [script] = await db.select().from(scripts).where(eq(scripts.id, params.scriptId)).limit(1);
    if (!script) {
      throw new Error("Source script no longer exists.");
    }

    const result = await withRetry(() =>
      storyboardProvider.generate({ script: script.content, platform: params.platform }),
    );

    // Storyboard generation isn't resumable per-scene like Visual/Animation
    // — "try again" always means a fresh attempt (existing UI copy already
    // says so). Clear any scene list from a previous storyboard job on this
    // project first, so regenerating (e.g. after a truncated response,
    // M4) replaces it instead of appending a duplicate batch. Downstream
    // media assets aren't deleted — they just lose their scene reference
    // (media_asset.scene_id is "set null" on delete), which is the correct
    // outcome for a deliberate regenerate.
    await db.delete(scenes).where(eq(scenes.projectId, job.projectId));

    await db.insert(scenes).values(
      result.scenes.map((scene, index) => ({
        projectId: job.projectId,
        order: index,
        narration: scene.narration,
        visualDescription: scene.visualDescription,
        audioDirection: scene.audioDirection,
        durationSeconds: scene.durationSeconds,
        status: "draft" as const,
        provider: result.provider,
        model: result.model,
      })),
    );

    // truncated=true (M4): the model's response hit its output ceiling
    // mid-array and this is a recovered partial list, not the full
    // breakdown — never silently drop that context, the Owner needs to know
    // to regenerate rather than assume the scene list is complete.
    await completeStep(stepId, { sceneCount: result.scenes.length, truncated: result.truncated });
    await completeJob(job.id);
    return null;
  } catch (err) {
    const publicMsg = publicErrorMessage(err);
    await failStep(stepId, publicMsg);
    await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return publicMsg;
  }
}

export const storyboardJobTask = defineJobTask<ProjectJob>({
  id: "execute-storyboard-job",
  maxDuration: 180,
  executor: executeStoryboardJob,
});
