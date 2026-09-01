import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, mediaAssets, projects, scenes, thumbnails } from "@/db/schema";
import {
  completeJob,
  completeStep,
  failJob,
  failStep,
  publicErrorMessage,
  recordActualCostFromEstimate,
  startStep,
  withRetry,
} from "@/lib/jobs";
import { imageProvider, thumbnailRatioForPlatform } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { overlayHeadline } from "@/lib/thumbnail-overlay";
import { THUMBNAIL_STYLES } from "@/lib/validation";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/thumbnail-actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

function buildPrompt(projectTitle: string, sceneVisual: string | null, styleModifier: string): string {
  const subject = sceneVisual ? `${projectTitle} — ${sceneVisual}` : projectTitle;
  return `Thumbnail/cover image for a short-form video. Subject: ${subject}. Style: ${styleModifier}. Leave the lower third relatively uncluttered for text to be added afterward. No text or lettering in the image itself.`;
}

export async function executeThumbnailJob(job: ProjectJob): Promise<string | null> {
  const params = job.params as { styles: string[]; platform: string };

  const doneStyles = new Set(
    (await db.select({ style: thumbnails.style }).from(thumbnails).where(eq(thumbnails.jobId, job.id))).map(
      (t) => t.style,
    ),
  );

  const [firstScene] = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, job.projectId))
    .orderBy(asc(scenes.order))
    .limit(1);
  const [projectRow] = await db.select().from(projects).where(eq(projects.id, job.projectId)).limit(1);
  if (!projectRow) {
    const msg = "This project no longer exists.";
    await failJob(job.id, msg, msg);
    return msg;
  }
  const projectTitle = projectRow.title ?? "Untitled";
  const sceneVisual = firstScene?.visualDescription ?? null;

  const { ratio, width, height } = thumbnailRatioForPlatform(params.platform);

  for (let i = 0; i < params.styles.length; i++) {
    const styleKey = params.styles[i];
    if (doneStyles.has(styleKey)) {
      continue;
    }

    const stepId = await startStep(job.id, `generate_thumbnail_${styleKey}`, i);

    const styleDef = THUMBNAIL_STYLES.find((s) => s.key === styleKey);
    if (!styleDef) {
      const msg = `Unknown thumbnail style "${styleKey}".`;
      await failStep(stepId, msg);
      await failJob(job.id, msg, msg);
      return msg;
    }

    try {
      const prompt = buildPrompt(projectTitle, sceneVisual, styleDef.promptModifier);
      const result = await withRetry(() => imageProvider.generate({ prompt, ratio }));

      const baseExtension = result.contentType.includes("png") ? "png" : "jpg";
      const baseKey = `projects/${job.projectId}/thumbnails/${job.id}-${styleKey}-base.${baseExtension}`;
      const baseUploaded = await storageProvider.putObject({
        key: baseKey,
        body: result.image,
        contentType: result.contentType,
      });

      const [baseAsset] = await db
        .insert(mediaAssets)
        .values({
          ownerId: projectRow.ownerId,
          projectId: job.projectId,
          jobId: job.id,
          type: "thumbnail_base",
          storageKey: baseUploaded.key,
          contentType: result.contentType,
          sizeBytes: baseUploaded.sizeBytes,
          provider: result.provider,
          model: result.model,
        })
        .returning();

      const composited = await overlayHeadline(result.image, projectTitle, width, height);
      const compositedKey = `projects/${job.projectId}/thumbnails/${job.id}-${styleKey}-composited.png`;
      const compositedUploaded = await storageProvider.putObject({
        key: compositedKey,
        body: composited,
        contentType: "image/png",
      });

      const [compositedAsset] = await db
        .insert(mediaAssets)
        .values({
          ownerId: projectRow.ownerId,
          projectId: job.projectId,
          jobId: job.id,
          type: "thumbnail_composited",
          storageKey: compositedUploaded.key,
          contentType: "image/png",
          sizeBytes: compositedUploaded.sizeBytes,
          provider: result.provider,
          model: result.model,
        })
        .returning();

      await db.insert(thumbnails).values({
        projectId: job.projectId,
        jobId: job.id,
        platform: params.platform,
        style: styleKey,
        headlineText: projectTitle,
        baseAssetId: baseAsset.id,
        compositedAssetId: compositedAsset.id,
      });

      await completeStep(stepId, { sizeBytes: baseUploaded.sizeBytes });
    } catch (err) {
      const publicMsg = publicErrorMessage(err);
      await failStep(stepId, publicMsg);
      await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
      return publicMsg;
    }
  }

  await recordActualCostFromEstimate(job.id);
  await completeJob(job.id);
  return null;
}

export const thumbnailJobTask = defineJobTask<ProjectJob>({
  id: "execute-thumbnail-job",
  maxDuration: 900,
  executor: executeThumbnailJob,
});
