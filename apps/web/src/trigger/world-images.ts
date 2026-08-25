import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationJobs, mediaAssets, worldReferences, worlds } from "@/db/schema";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { buildWorldPrompt } from "@/lib/world-prompt";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// worlds/actions.ts.
export async function executeWorldImagesJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
  const params = job.params as { worldId: string; views: string[] };

  const [world] = await db.select().from(worlds).where(eq(worlds.id, params.worldId)).limit(1);
  if (!world) {
    const msg = "This world no longer exists.";
    await failJob(job.id, msg, msg);
    return msg;
  }

  const approvedRefs = await db
    .select({ ref: worldReferences, asset: mediaAssets })
    .from(worldReferences)
    .innerJoin(mediaAssets, eq(worldReferences.mediaAssetId, mediaAssets.id))
    .where(and(eq(worldReferences.worldId, world.id), eq(worldReferences.approved, true)))
    .limit(1);
  const referenceAsset = approvedRefs[0]?.asset ?? null;

  const doneViews = new Set(
    (
      await db
        .select({ viewType: worldReferences.viewType })
        .from(worldReferences)
        .where(eq(worldReferences.jobId, job.id))
    ).map((r) => r.viewType),
  );

  for (let i = 0; i < params.views.length; i++) {
    const viewType = params.views[i];
    if (doneViews.has(viewType)) {
      continue;
    }

    const stepId = await startStep(job.id, `generate_${viewType}`, i);

    try {
      const referenceImages = referenceAsset
        ? [{ uri: await storageProvider.getSignedUrl(referenceAsset.storageKey, 600), tag: "SETTING" }]
        : undefined;

      const prompt = buildWorldPrompt(world, viewType, Boolean(referenceImages));
      const result = await withRetry(() =>
        imageProvider.generate({ prompt, ratio: "1104:832", referenceImages }),
      );

      const extension = result.contentType.includes("png") ? "png" : "jpg";
      const storageKey = `worlds/${world.id}/generated/${job.id}-${viewType}.${extension}`;
      const uploaded = await storageProvider.putObject({
        key: storageKey,
        body: result.image,
        contentType: result.contentType,
      });

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          projectId: null,
          jobId: job.id,
          type: "world_reference",
          storageKey: uploaded.key,
          contentType: result.contentType,
          sizeBytes: uploaded.sizeBytes,
          provider: result.provider,
          model: result.model,
        })
        .returning();

      await db.insert(worldReferences).values({
        worldId: world.id,
        mediaAssetId: asset.id,
        jobId: job.id,
        viewType,
        source: "generated",
        approved: false,
      });

      await completeStep(stepId, { sizeBytes: uploaded.sizeBytes });
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

export const worldImagesJobTask = defineJobTask<typeof generationJobs.$inferSelect>({
  id: "execute-world-images-job",
  maxDuration: 900,
  executor: executeWorldImagesJob,
});
