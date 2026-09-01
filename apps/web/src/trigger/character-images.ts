import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterReferences, characters, generationJobs, mediaAssets } from "@/db/schema";
import { buildCharacterPrompt } from "@/lib/character-prompt";
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
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// characters/actions.ts.
export async function executeCharacterImagesJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
  const params = job.params as { characterId: string; views: string[] };

  const [character] = await db.select().from(characters).where(eq(characters.id, params.characterId)).limit(1);
  if (!character) {
    const msg = "This character no longer exists.";
    await failJob(job.id, msg, msg);
    return msg;
  }

  const approvedRefs = await db
    .select({ ref: characterReferences, asset: mediaAssets })
    .from(characterReferences)
    .innerJoin(mediaAssets, eq(characterReferences.mediaAssetId, mediaAssets.id))
    .where(and(eq(characterReferences.characterId, character.id), eq(characterReferences.approved, true)))
    .limit(1);
  const referenceAsset = approvedRefs[0]?.asset ?? null;

  const doneViews = new Set(
    (
      await db
        .select({ viewType: characterReferences.viewType })
        .from(characterReferences)
        .where(eq(characterReferences.jobId, job.id))
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
        ? [{ uri: await storageProvider.getSignedUrl(referenceAsset.storageKey, 600), tag: "IDENTITY" }]
        : undefined;

      const prompt = buildCharacterPrompt(character, viewType, Boolean(referenceImages));
      const result = await withRetry(() =>
        imageProvider.generate({ prompt, ratio: "1104:832", referenceImages }),
      );

      const extension = result.contentType.includes("png") ? "png" : "jpg";
      const storageKey = `characters/${character.id}/generated/${job.id}-${viewType}.${extension}`;
      const uploaded = await storageProvider.putObject({
        key: storageKey,
        body: result.image,
        contentType: result.contentType,
      });

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          ownerId: character.ownerId,
          projectId: null,
          jobId: job.id,
          type: "character_reference",
          storageKey: uploaded.key,
          contentType: result.contentType,
          sizeBytes: uploaded.sizeBytes,
          provider: result.provider,
          model: result.model,
        })
        .returning();

      await db.insert(characterReferences).values({
        characterId: character.id,
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

  await recordActualCostFromEstimate(job.id);
  await completeJob(job.id);
  return null;
}

export const characterImagesJobTask = defineJobTask<typeof generationJobs.$inferSelect>({
  id: "execute-character-images-job",
  maxDuration: 900,
  executor: executeCharacterImagesJob,
});
