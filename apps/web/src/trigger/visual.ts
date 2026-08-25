import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  brandKits,
  characterReferences,
  characters,
  continuityChecks,
  generationJobs,
  mediaAssets,
  projects,
  scenes,
  worldReferences,
  worlds,
} from "@/db/schema";
import { characterAppearanceSummary } from "@/lib/character-prompt";
import { runContinuityCheck } from "@/lib/continuity-checker";
import { completeJob, completeStep, failJob, failStep, publicErrorMessage, startStep, withRetry } from "@/lib/jobs";
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { worldSettingSummary } from "@/lib/world-prompt";
import { defineJobTask } from "./lib/job-task";

// See trigger/script.ts for why this lives here instead of
// projects/[id]/actions.ts.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

/**
 * Generates one image per scene in job.params.sceneIds, as separate
 * job_steps. Resumable at scene granularity: a retry re-checks which scenes
 * already have a media_asset from THIS job and skips them, so a failure
 * partway through a batch doesn't lose completed scenes or re-charge for
 * them.
 */
export async function executeVisualJob(job: ProjectJob): Promise<string | null> {
  const params = job.params as { sceneIds: string[]; ratio: string };

  const doneAssets = await db
    .select({ sceneId: mediaAssets.sceneId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.jobId, job.id), eq(mediaAssets.type, "scene_image")));
  const doneSceneIds = new Set(doneAssets.map((a) => a.sceneId));

  // Section 17: Brand Kit's defaultVisualStyle auto-applies to every scene
  // unless this project set its own visualStyleOverride. Resolved once per
  // batch, not per scene — it doesn't vary scene to scene.
  const [projectRow] = await db.select().from(projects).where(eq(projects.id, job.projectId)).limit(1);
  const [brandKit] = projectRow
    ? await db.select().from(brandKits).where(eq(brandKits.ownerId, projectRow.ownerId)).limit(1)
    : [];
  const effectiveVisualStyle = projectRow?.visualStyleOverride ?? brandKit?.defaultVisualStyle ?? null;

  for (let i = 0; i < params.sceneIds.length; i++) {
    const sceneId = params.sceneIds[i];
    if (doneSceneIds.has(sceneId)) {
      continue;
    }

    const stepId = await startStep(job.id, `generate_visual_scene_${i}`, i);

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
    if (!scene) {
      const msg = "A scene was deleted before its visual could be generated.";
      await failStep(stepId, msg);
      await failJob(job.id, msg, msg);
      return msg;
    }

    try {
      const [character, world] = await Promise.all([
        scene.characterId
          ? db.select().from(characters).where(eq(characters.id, scene.characterId)).limit(1).then((r) => r[0])
          : Promise.resolve(undefined),
        scene.worldId
          ? db.select().from(worlds).where(eq(worlds.id, scene.worldId)).limit(1).then((r) => r[0])
          : Promise.resolve(undefined),
      ]);

      const lockedDetailsParts = [
        character && `Character in scene (must match exactly): ${characterAppearanceSummary(character)}`,
        world && `Setting (must match exactly): ${worldSettingSummary(world)}`,
      ].filter((p): p is string => Boolean(p));

      const promptParts = [
        scene.visualDescription,
        ...lockedDetailsParts,
        effectiveVisualStyle && `Visual style: ${effectiveVisualStyle}`,
      ].filter((p): p is string => Boolean(p));
      const prompt = `${promptParts.join(". ")}.`;

      const referenceImages: { uri: string; tag: string }[] = [];
      if (character) {
        const [approvedCharRef] = await db
          .select({ asset: mediaAssets })
          .from(characterReferences)
          .innerJoin(mediaAssets, eq(characterReferences.mediaAssetId, mediaAssets.id))
          .where(and(eq(characterReferences.characterId, character.id), eq(characterReferences.approved, true)))
          .limit(1);
        if (approvedCharRef) {
          referenceImages.push({
            uri: await storageProvider.getSignedUrl(approvedCharRef.asset.storageKey, 600),
            tag: "IDENTITY",
          });
        }
      }
      if (world) {
        const [approvedWorldRef] = await db
          .select({ asset: mediaAssets })
          .from(worldReferences)
          .innerJoin(mediaAssets, eq(worldReferences.mediaAssetId, mediaAssets.id))
          .where(and(eq(worldReferences.worldId, world.id), eq(worldReferences.approved, true)))
          .limit(1);
        if (approvedWorldRef) {
          referenceImages.push({
            uri: await storageProvider.getSignedUrl(approvedWorldRef.asset.storageKey, 600),
            tag: "SETTING",
          });
        }
      }

      const result = await withRetry(() =>
        imageProvider.generate({
          prompt,
          ratio: params.ratio,
          referenceImages: referenceImages.length ? referenceImages : undefined,
        }),
      );

      const extension = result.contentType.includes("png") ? "png" : "jpg";
      const storageKey = `projects/${job.projectId}/scenes/${sceneId}/visual-${job.id}.${extension}`;
      const uploaded = await storageProvider.putObject({
        key: storageKey,
        body: result.image,
        contentType: result.contentType,
      });

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          projectId: job.projectId,
          jobId: job.id,
          sceneId,
          type: "scene_image",
          storageKey: uploaded.key,
          contentType: result.contentType,
          sizeBytes: uploaded.sizeBytes,
          provider: result.provider,
          model: result.model,
        })
        .returning();

      // Continuity Checker (Section 11): best-effort QA, never lets a
      // failed/misconfigured check invalidate a successfully generated
      // visual — the image generation above already succeeded and was paid
      // for either way.
      if (lockedDetailsParts.length > 0) {
        try {
          const checkResult = await runContinuityCheck({
            imageBytes: result.image,
            contentType: result.contentType,
            lockedDetails: lockedDetailsParts.join("\n"),
          });
          await db.insert(continuityChecks).values({
            sceneId,
            mediaAssetId: asset.id,
            characterId: character?.id ?? null,
            worldId: world?.id ?? null,
            warnings: checkResult.warnings,
            provider: checkResult.provider,
            model: checkResult.model,
          });
        } catch {
          // Not configured, or the provider call failed — skip silently.
        }
      }

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

// A batch loops over every scene needing a visual, one Runway call each —
// generous ceiling for long-form projects with many scenes (M4).
export const visualJobTask = defineJobTask<ProjectJob>({
  id: "execute-visual-job",
  maxDuration: 1800,
  executor: executeVisualJob,
});
