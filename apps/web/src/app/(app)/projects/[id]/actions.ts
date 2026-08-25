"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  characterReferences,
  characters,
  continuityChecks,
  generationJobs,
  mediaAssets,
  scenes,
  scripts,
  worldReferences,
  worlds,
} from "@/db/schema";
import { loadOwnedCharacter, loadOwnedProject, loadOwnedWorld } from "@/lib/authz";
import { characterAppearanceSummary } from "@/lib/character-prompt";
import { isContinuityCheckerConfigured, runContinuityCheck } from "@/lib/continuity-checker";
import {
  estimateAssemblyCostCents,
  estimateContinuityCheckCostCents,
  estimateGenerationCostCents,
  estimateImageCostCents,
  estimateTTSCostCents,
  estimateVideoCostCents,
} from "@/lib/cost-estimate";
import {
  cancelJob,
  completeJob,
  completeStep,
  confirmJob,
  failJob,
  failStep,
  getStepOutput,
  isStalled,
  publicErrorMessage,
  requestJob,
  startStep,
  updateStepOutput,
  withRetry,
} from "@/lib/jobs";
import {
  assemblyProvider,
  imageProvider,
  ratioForPlatform,
  scriptProvider,
  shotstackAspectRatioForPlatform,
  storyboardProvider,
  ttsProvider,
  videoProvider,
} from "@/lib/providers";
import type { AssemblyCaption, AssemblyClip } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { sceneUpdateSchema } from "@/lib/validation";
import { worldSettingSummary } from "@/lib/world-prompt";

const STORYBOARD_MODEL = "claude-sonnet-5";

/**
 * Scales with script length so the pre-confirmation estimate stays honest
 * for long-form scripts too (M4) — a flat assumption badly undersells cost
 * once a script needs dozens of scenes instead of a handful. Rough model:
 * ~600 chars of script per scene, ~220 output tokens (JSON overhead + four
 * fields) per scene, capped at the provider's own 8192 output ceiling.
 */
function estimatedStoryboardOutputTokens(scriptChars: number): number {
  const estimatedSceneCount = Math.max(2, Math.ceil(scriptChars / 600));
  return Math.min(8192, estimatedSceneCount * 220);
}

type ActionState = { error: string };

// generation_jobs.projectId is nullable at the schema level (Character
// Library jobs use characterId instead) — everything in this file only
// ever deals with project-scoped jobs, so narrow to a non-null projectId
// once, right where a job enters this file's functions, rather than
// re-deriving it at every job.projectId use site.
type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

function asProjectJob(job: typeof generationJobs.$inferSelect): ProjectJob {
  if (!job.projectId) {
    throw new Error("Job is missing a project id.");
  }
  return job as ProjectJob;
}

async function getOwnedJob(jobId: string, userId: string): Promise<ProjectJob> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error("Job not found.");
  }
  const projectJob = asProjectJob(job);
  await loadOwnedProject(projectJob.projectId, userId);
  return projectJob;
}

// --- Script: confirm/cancel/retry. Requesting the job (with its cost
// estimate) happens in create-video/actions.ts since that's also where the
// project itself is created; the Owner confirms here, on the project page. ---

async function executeScriptJob(job: ProjectJob): Promise<string | null> {
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

export async function confirmScript(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeScriptJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelScript(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryScript(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeScriptJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

// --- Storyboard: request → confirm → run, mirroring the script leg ---

export async function requestStoryboard(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!storyboardProvider.isConfigured()) {
    return {
      error:
        "Storyboard generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app.",
    };
  }

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, project.id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  if (!script) {
    return { error: "Generate a script first — the storyboard is built from it." };
  }

  const estimate = estimateGenerationCostCents({
    model: STORYBOARD_MODEL,
    promptChars: script.content.length + 800,
    assumedOutputTokens: estimatedStoryboardOutputTokens(script.content.length),
  });

  await requestJob({
    projectId: project.id,
    type: "storyboard",
    provider: storyboardProvider.name,
    model: STORYBOARD_MODEL,
    idempotencyKey,
    params: { scriptId: script.id, platform: project.platform ?? "Custom Project" },
    estimatedCostCents: estimate.cents,
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

async function executeStoryboardJob(job: ProjectJob): Promise<string | null> {
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

export async function confirmStoryboard(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeStoryboardJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelStoryboard(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryStoryboard(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeStoryboardJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

// --- Voice: request → confirm → run. Combines all scenes' narration into
// one track — Voice Studio (Section 13) will add per-speaker/multi-voice
// later; this is the "1 TTS voice" leg of the M1 vertical slice. ---

export async function requestVoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!ttsProvider.isConfigured()) {
    return {
      error:
        "Voice generation isn't connected yet — add ELEVENLABS_API_KEY to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app. Generated audio has to land in private storage, not a temporary provider URL.",
    };
  }

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

  if (projectScenes.length === 0) {
    return { error: "Generate a storyboard first — voice narration is built from the scene list." };
  }

  const narration = projectScenes.map((s) => s.narration).join("\n\n");

  await requestJob({
    projectId: project.id,
    type: "voice",
    provider: ttsProvider.name,
    model: null,
    idempotencyKey,
    params: { narration },
    estimatedCostCents: estimateTTSCostCents({
      provider: ttsProvider.name,
      characterCount: narration.length,
    }),
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

async function executeVoiceJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "generate_voice", 0);

  try {
    const params = job.params as { narration: string };
    const result = await withRetry(() => ttsProvider.generate({ text: params.narration }));

    const storageKey = `projects/${job.projectId}/voice/${job.id}.mp3`;
    const uploaded = await storageProvider.putObject({
      key: storageKey,
      body: result.audio,
      contentType: result.contentType,
    });

    await db.insert(mediaAssets).values({
      projectId: job.projectId,
      jobId: job.id,
      type: "voice_audio",
      storageKey: uploaded.key,
      contentType: result.contentType,
      sizeBytes: uploaded.sizeBytes,
      provider: result.provider,
      model: result.model,
      metadata: { characterCount: result.characterCount },
    });

    await completeStep(stepId, { characterCount: result.characterCount, sizeBytes: uploaded.sizeBytes });
    await completeJob(job.id);
    return null;
  } catch (err) {
    const publicMsg = publicErrorMessage(err);
    await failStep(stepId, publicMsg);
    await failJob(job.id, publicMsg, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return publicMsg;
  }
}

export async function confirmVoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeVoiceJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelVoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryVoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeVoiceJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function getVoicePlaybackUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !asset.projectId) {
    throw new Error("Media asset not found.");
  }
  await loadOwnedProject(asset.projectId, session.user.id);
  return storageProvider.getSignedUrl(asset.storageKey);
}

// --- Visual: request → confirm → run. M1's vertical slice covers exactly
// one scene's visual (the first) — per-scene visuals for the rest of the
// list, and image-to-video animation on top of this still image, are both
// deferred: animating requires a second async Runway call over a publicly
// fetchable image URL and is worth building once there's a real API key to
// test the round trip against, rather than shipping it unverified. ---

export async function requestVisual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!imageProvider.isConfigured()) {
    return {
      error:
        "Visual generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

  if (projectScenes.length === 0) {
    return { error: "Generate a storyboard first — visuals are built from the scene list." };
  }

  const doneAssets = await db
    .select({ sceneId: mediaAssets.sceneId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "scene_image")));
  const doneSceneIds = new Set(doneAssets.map((a) => a.sceneId));

  const scenesNeeded = projectScenes.filter((s) => !doneSceneIds.has(s.id));
  if (scenesNeeded.length === 0) {
    return { error: "Every scene already has a visual." };
  }

  // Scenes with an assigned character/world get a Continuity Checker pass
  // (Section 11) bundled into the same confirmation — one estimate covering
  // everything that will actually run, rather than a second confirm step.
  const continuityCheckerAvailable = isContinuityCheckerConfigured();
  const estimatedCostCents = scenesNeeded.reduce((sum, s) => {
    let cost = estimateImageCostCents(imageProvider.name);
    if (continuityCheckerAvailable && (s.characterId || s.worldId)) {
      cost += estimateContinuityCheckCostCents();
    }
    return sum + cost;
  }, 0);

  await requestJob({
    projectId: project.id,
    type: "visual",
    provider: imageProvider.name,
    model: null,
    idempotencyKey,
    params: {
      sceneIds: scenesNeeded.map((s) => s.id),
      ratio: ratioForPlatform(project.platform ?? "Custom Project"),
    },
    estimatedCostCents,
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

/**
 * Generates one image per scene in job.params.sceneIds, as separate
 * job_steps. Resumable at scene granularity: a retry re-checks which scenes
 * already have a media_asset from THIS job and skips them, so a failure
 * partway through a batch doesn't lose completed scenes or re-charge for
 * them.
 */
async function executeVisualJob(job: ProjectJob): Promise<string | null> {
  const params = job.params as { sceneIds: string[]; ratio: string };

  const doneAssets = await db
    .select({ sceneId: mediaAssets.sceneId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.jobId, job.id), eq(mediaAssets.type, "scene_image")));
  const doneSceneIds = new Set(doneAssets.map((a) => a.sceneId));

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

      const prompt = lockedDetailsParts.length
        ? `${scene.visualDescription}. ${lockedDetailsParts.join(". ")}.`
        : scene.visualDescription;

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

export async function confirmVisual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeVisualJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelVisual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryVisual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeVisualJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function getVisualUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !asset.projectId) {
    throw new Error("Media asset not found.");
  }
  await loadOwnedProject(asset.projectId, session.user.id);
  return storageProvider.getSignedUrl(asset.storageKey);
}

// --- Animation: request → confirm → run. Turns an existing scene image
// into a short video via Runway's image-to-video endpoint. Same resumable
// per-scene job pattern as Visual — a batch only targets scenes that have
// an image but no animation yet, and retry skips scenes already done. ---

function pickVideoDuration(sceneDurationSeconds: number | null): 5 | 10 {
  return (sceneDurationSeconds ?? 5) <= 5 ? 5 : 10;
}

export async function requestAnimation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!videoProvider.isConfigured()) {
    return {
      error:
        "Animation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

  if (projectScenes.length === 0) {
    return { error: "Generate a storyboard first." };
  }

  const allAssets = await db.select().from(mediaAssets).where(eq(mediaAssets.projectId, project.id));
  const imageSceneIds = new Set(allAssets.filter((a) => a.type === "scene_image").map((a) => a.sceneId));
  const videoSceneIds = new Set(allAssets.filter((a) => a.type === "scene_video").map((a) => a.sceneId));

  const scenesNeeded = projectScenes.filter((s) => imageSceneIds.has(s.id) && !videoSceneIds.has(s.id));
  if (scenesNeeded.length === 0) {
    return {
      error: imageSceneIds.size > 0
        ? "Every scene with a visual already has an animation."
        : "Generate visuals first — animation is built from a scene's existing image.",
    };
  }

  const ratio = ratioForPlatform(project.platform ?? "Custom Project");
  const estimatedCostCents = scenesNeeded.reduce(
    (sum, s) =>
      sum +
      estimateVideoCostCents({
        provider: videoProvider.name,
        durationSeconds: pickVideoDuration(s.durationSeconds),
      }),
    0,
  );

  await requestJob({
    projectId: project.id,
    type: "animation",
    provider: videoProvider.name,
    model: null,
    idempotencyKey,
    params: { sceneIds: scenesNeeded.map((s) => s.id), ratio },
    estimatedCostCents,
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

async function executeAnimationJob(job: ProjectJob): Promise<string | null> {
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

export async function confirmAnimation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeAnimationJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelAnimation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryAnimation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeAnimationJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function getAnimationUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !asset.projectId) {
    throw new Error("Media asset not found.");
  }
  await loadOwnedProject(asset.projectId, session.user.id);
  return storageProvider.getSignedUrl(asset.storageKey);
}

// --- Assembly: request → confirm → run. Composites every scene's visual
// (animated clip if one exists, else the still image), the voice track,
// and burned-in captions into one final MP4 via Shotstack. Unlike
// Visual/Animation this is a single Shotstack render call for the whole
// video, not resumable per scene — a retry re-submits the whole render,
// since there's no meaningful "partial" render to resume. Requires every
// scene to already have a visual; there's no partial-coverage mode (a scene
// with no image/clip would leave a gap in the timeline while the audio
// keeps playing over it, which is worse than just not offering this yet). ---

export async function requestAssembly(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!assemblyProvider.isConfigured()) {
    return {
      error:
        "Video assembly isn't connected yet — add SHOTSTACK_API_KEY to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

  if (projectScenes.length === 0) {
    return { error: "Generate a storyboard first." };
  }

  const [voiceAsset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, project.id), eq(mediaAssets.type, "voice_audio")))
    .limit(1);

  if (!voiceAsset) {
    return { error: "Generate a voice track first — the final video needs narration audio." };
  }

  const allAssets = await db.select().from(mediaAssets).where(eq(mediaAssets.projectId, project.id));
  const visualSceneIds = new Set(
    allAssets.filter((a) => a.type === "scene_image" || a.type === "scene_video").map((a) => a.sceneId),
  );
  const missingVisuals = projectScenes.filter((s) => !visualSceneIds.has(s.id));
  if (missingVisuals.length > 0) {
    return {
      error: `${missingVisuals.length} scene${missingVisuals.length === 1 ? "" : "s"} still ${missingVisuals.length === 1 ? "needs" : "need"} a visual before the final video can be assembled.`,
    };
  }

  const totalDurationSeconds = projectScenes.reduce((sum, s) => sum + (s.durationSeconds ?? 5), 0);
  const aspectRatio = shotstackAspectRatioForPlatform(project.platform ?? "Custom Project");

  await requestJob({
    projectId: project.id,
    type: "assembly",
    provider: assemblyProvider.name,
    model: null,
    idempotencyKey,
    params: { sceneIds: projectScenes.map((s) => s.id), aspectRatio },
    estimatedCostCents: estimateAssemblyCostCents({
      provider: assemblyProvider.name,
      totalDurationSeconds,
    }),
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

async function executeAssemblyJob(job: ProjectJob): Promise<string | null> {
  const stepId = await startStep(job.id, "assemble_video", 0);

  try {
    // M4: a render already submitted by a previous (stalled/crashed) attempt
    // is resumed by polling the same renderId rather than submitting — and
    // paying for — a second one. startStep() above never clears a step's
    // existing output, so this survives across retries of the same job.
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

export async function confirmAssembly(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/projects/${job.projectId}`);
    return { error: "" };
  }

  const error = await executeAssemblyJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelAssembly(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
}

export async function retryAssembly(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeAssemblyJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function getFinalVideoUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !asset.projectId) {
    throw new Error("Media asset not found.");
  }
  await loadOwnedProject(asset.projectId, session.user.id);
  return storageProvider.getSignedUrl(asset.storageKey);
}

// --- Scene editing ---

export async function updateScene(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const parsed = sceneUpdateSchema.safeParse({
    sceneId: formData.get("sceneId"),
    narration: formData.get("narration"),
    visualDescription: formData.get("visualDescription"),
    audioDirection: formData.get("audioDirection"),
    durationSeconds: formData.get("durationSeconds"),
    characterId: formData.get("characterId"),
    worldId: formData.get("worldId"),
  });

  if (!parsed.success) {
    return {
      error: "Check the scene fields — narration, visual description, and duration are required.",
    };
  }

  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.id, parsed.data.sceneId), eq(scenes.projectId, project.id)))
    .limit(1);

  if (!scene) {
    return { error: "Scene not found." };
  }

  // Ownership check on the assigned character/world, not just format —
  // these ids come from a <select> populated by the Owner's own list, but
  // never trust a submitted id without re-verifying who owns it.
  if (parsed.data.characterId) {
    try {
      await loadOwnedCharacter(parsed.data.characterId, session.user.id);
    } catch {
      return { error: "That character wasn't found." };
    }
  }
  if (parsed.data.worldId) {
    try {
      await loadOwnedWorld(parsed.data.worldId, session.user.id);
    } catch {
      return { error: "That world wasn't found." };
    }
  }

  await db
    .update(scenes)
    .set({
      narration: parsed.data.narration,
      visualDescription: parsed.data.visualDescription,
      audioDirection: parsed.data.audioDirection,
      durationSeconds: parsed.data.durationSeconds,
      characterId: parsed.data.characterId,
      worldId: parsed.data.worldId,
      version: scene.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, scene.id));

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

export async function acknowledgeContinuityCheck(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const checkId = String(formData.get("checkId") ?? "");
  const [check] = await db.select().from(continuityChecks).where(eq(continuityChecks.id, checkId)).limit(1);
  if (!check) {
    return;
  }

  const [scene] = await db.select().from(scenes).where(eq(scenes.id, check.sceneId)).limit(1);
  if (!scene) {
    return;
  }
  const project = await loadOwnedProject(scene.projectId, session.user.id);

  await db.update(continuityChecks).set({ acknowledgedAt: new Date() }).where(eq(continuityChecks.id, checkId));
  revalidatePath(`/projects/${project.id}`);
}

export async function moveScene(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);
  const sceneId = String(formData.get("sceneId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(scenes.order);

  const index = projectScenes.findIndex((s) => s.id === sceneId);
  if (index === -1) {
    return { error: "Scene not found." };
  }

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= projectScenes.length) {
    return { error: "" };
  }

  const a = projectScenes[index];
  const b = projectScenes[swapIndex];

  await db.update(scenes).set({ order: b.order, updatedAt: new Date() }).where(eq(scenes.id, a.id));
  await db.update(scenes).set({ order: a.order, updatedAt: new Date() }).where(eq(scenes.id, b.id));

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}
