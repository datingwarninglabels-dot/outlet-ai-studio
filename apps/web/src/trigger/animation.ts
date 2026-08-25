import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, mediaAssets, scenes } from "@/db/schema";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { videoProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

// Duplicated from projects/[id]/actions.ts (also used there by
// requestAnimation, which stays a request-side, not execute-side,
// concern) rather than imported — a value import back into actions.ts
// would recreate the circular dependency this whole split exists to avoid.
function pickVideoDuration(sceneDurationSeconds: number | null): 5 | 10 {
  return (sceneDurationSeconds ?? 5) <= 5 ? 5 : 10;
}

// Same resumable per-scene batch shape as visual (trigger/visual.ts).
export async function executeAnimationJob(job: ProjectJob): Promise<string | null> {
  const params = job.params as { sceneIds: string[]; ratio: string };

  const doneAssets = await db
    .select({ sceneId: mediaAssets.sceneId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.jobId, job.id), eq(mediaAssets.type, "scene_video")));
  const doneSceneIds = new Set(doneAssets.map((a) => a.sceneId));

  for (let i = 0; i < params.sceneIds.length; i++) {
    const sceneId = params.sceneIds[i];
    if (doneSceneIds.has(sceneId)) {
      continue;
    }

    const stepId = await startStep(job.id, `animate_scene_${i}`, i);

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
    const [imageAsset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.sceneId, sceneId), eq(mediaAssets.type, "scene_image")))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(1);

    if (!scene || !imageAsset) {
      const msg = "This scene's source image is missing — generate a visual for it first.";
      await failStep(stepId, msg);
      await failJob(job.id, msg, msg);
      return msg;
    }

    try {
      const imageUrl = await storageProvider.getSignedUrl(imageAsset.storageKey, 600);
      const durationSeconds = pickVideoDuration(scene.durationSeconds);
      const result = await withRetry(() =>
        videoProvider.generate({
          imageUrl,
          prompt: scene.visualDescription,
          ratio: params.ratio,
          durationSeconds,
        }),
      );

      const extension = result.contentType.includes("mp4") ? "mp4" : "mov";
      const storageKey = `projects/${job.projectId}/scenes/${sceneId}/animation-${job.id}.${extension}`;
      const uploaded = await storageProvider.putObject({
        key: storageKey,
        body: result.video,
        contentType: result.contentType,
      });

      await db.insert(mediaAssets).values({
        projectId: job.projectId,
        jobId: job.id,
        sceneId,
        type: "scene_video",
        storageKey: uploaded.key,
        contentType: result.contentType,
        sizeBytes: uploaded.sizeBytes,
        provider: result.provider,
        model: result.model,
        metadata: { durationSeconds },
      });

      await completeStep(stepId, { sizeBytes: uploaded.sizeBytes, durationSeconds });
    } catch (err) {
      const publicMsg = publicErrorMessage(err);
      await failStep(stepId, publicMsg);
      await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
      return publicMsg;
    }
  }

  await completeJob(job.id);
  return null;
}

// Same per-scene batch shape as visual, but each Runway image-to-video call
// alone can run several minutes — this was the clearest case of the
// timeout problem Milestone 1 exists to fix.
export const animationJobTask = defineJobTask<ProjectJob>({
  id: "execute-animation-job",
  maxDuration: 3600,
  executor: executeAnimationJob,
});
