import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, mediaAssets, scenes } from "@/db/schema";
import {
  completeJob,
  completeStep,
  failJob,
  failStep,
  getStepOutput,
  publicErrorMessage,
  startStep,
  updateStepOutput,
  withRetry,
} from "@/lib/jobs";
import { assemblyProvider } from "@/lib/providers";
import type { AssemblyCaption, AssemblyClip } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

export async function executeAssemblyJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "assemble_video", 0);

  try {
    // M4: a render already submitted by a previous (stalled/crashed) attempt
    // is resumed by polling the same renderId rather than submitting — and
    // paying for — a second one. startStep() above never clears a step's
    // existing output, so this survives across retries of the same job.
    // Now that generation runs as a Trigger.dev task, "a retry genuinely
    // resumes" matters even more than it did in-process — a task can be
    // interrupted and re-run by the platform itself, not just by an Owner
    // clicking Retry.
    const existingOutput = (await getStepOutput(stepId)) as
      | { renderId: string; totalDurationSeconds: number }
      | null;

    let renderId: string;
    let totalDurationSeconds: number;

    if (existingOutput?.renderId) {
      renderId = existingOutput.renderId;
      totalDurationSeconds = existingOutput.totalDurationSeconds;
    } else {
      const params = job.params as { sceneIds: string[]; aspectRatio: "9:16" | "16:9" };

      const [voiceAsset] = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.projectId, job.projectId), eq(mediaAssets.type, "voice_audio")))
        .orderBy(desc(mediaAssets.createdAt))
        .limit(1);
      if (!voiceAsset) {
        throw new Error("Voice track no longer exists.");
      }

      const clips: AssemblyClip[] = [];
      const captions: AssemblyCaption[] = [];
      let cursor = 0;

      for (const sceneId of params.sceneIds) {
        const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
        if (!scene) {
          throw new Error("A scene was deleted before assembly could run.");
        }

        const [videoAsset] = await db
          .select()
          .from(mediaAssets)
          .where(and(eq(mediaAssets.sceneId, sceneId), eq(mediaAssets.type, "scene_video")))
          .orderBy(desc(mediaAssets.createdAt))
          .limit(1);

        const [imageAsset] = videoAsset
          ? []
          : await db
              .select()
              .from(mediaAssets)
              .where(and(eq(mediaAssets.sceneId, sceneId), eq(mediaAssets.type, "scene_image")))
              .orderBy(desc(mediaAssets.createdAt))
              .limit(1);

        const asset = videoAsset ?? imageAsset;
        if (!asset) {
          throw new Error("A scene is missing its visual.");
        }

        const mediaUrl = await storageProvider.getSignedUrl(asset.storageKey, 1800);
        const durationSeconds = scene.durationSeconds ?? 5;

        clips.push({ mediaUrl, mediaType: videoAsset ? "video" : "image", durationSeconds });
        captions.push({ text: scene.narration, startSeconds: cursor, durationSeconds });
        cursor += durationSeconds;
      }

      const audioUrl = await storageProvider.getSignedUrl(voiceAsset.storageKey, 1800);

      const submitted = await withRetry(() =>
        assemblyProvider.submitRender({ clips, audioUrl, captions, aspectRatio: params.aspectRatio }),
      );
      renderId = submitted.renderId;
      totalDurationSeconds = cursor;
      // Persist before polling — if the poll below stalls or the process
      // dies, a retry must find this and resume rather than resubmit.
      await updateStepOutput(stepId, { renderId, totalDurationSeconds });
    }

    const result = await withRetry(() => assemblyProvider.pollAndDownload(renderId));

    const storageKey = `projects/${job.projectId}/final-${job.id}.mp4`;
    const uploaded = await storageProvider.putObject({
      key: storageKey,
      body: result.video,
      contentType: result.contentType,
    });

    await db.insert(mediaAssets).values({
      projectId: job.projectId,
      jobId: job.id,
      type: "final_video",
      storageKey: uploaded.key,
      contentType: result.contentType,
      sizeBytes: uploaded.sizeBytes,
      provider: result.provider,
      metadata: { totalDurationSeconds },
    });

    await completeStep(stepId, { sizeBytes: uploaded.sizeBytes, totalDurationSeconds, renderId });
    await completeJob(job.id);
    return null;
  } catch (err) {
    const publicMsg = publicErrorMessage(err);
    await failStep(stepId, publicMsg);
    await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return publicMsg;
  }
}

// The original motivating case for Milestone 1: a Shotstack render alone
// can poll for ~6 minutes, and executeAssemblyJob's own withRetry can
// multiply that further.
export const assemblyJobTask = defineJobTask<ProjectJob>({
  id: "execute-assembly-job",
  maxDuration: 3600,
  executor: executeAssemblyJob,
});
