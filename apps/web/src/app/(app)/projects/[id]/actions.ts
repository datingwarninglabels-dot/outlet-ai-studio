"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, mediaAssets, scenes, scripts } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import {
  estimateGenerationCostCents,
  estimateImageCostCents,
  estimateTTSCostCents,
} from "@/lib/cost-estimate";
import {
  cancelJob,
  completeJob,
  completeStep,
  confirmJob,
  failJob,
  failStep,
  isStalled,
  publicErrorMessage,
  requestJob,
  startStep,
  withRetry,
} from "@/lib/jobs";
import { imageProvider, ratioForPlatform, scriptProvider, storyboardProvider, ttsProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { sceneUpdateSchema } from "@/lib/validation";

const STORYBOARD_MODEL = "claude-sonnet-5";
const ASSUMED_STORYBOARD_OUTPUT_TOKENS = 1500;

type ActionState = { error: string };

async function getOwnedJob(jobId: string, userId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error("Job not found.");
  }
  await loadOwnedProject(job.projectId, userId);
  return job;
}

// --- Script: confirm/cancel/retry. Requesting the job (with its cost
// estimate) happens in create-video/actions.ts since that's also where the
// project itself is created; the Owner confirms here, on the project page. ---

async function executeScriptJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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

  const error = await executeScriptJob(confirmed);
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
    assumedOutputTokens: ASSUMED_STORYBOARD_OUTPUT_TOKENS,
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

async function executeStoryboardJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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

    await completeStep(stepId, { sceneCount: result.scenes.length });
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

  const error = await executeStoryboardJob(confirmed);
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

async function executeVoiceJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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

  const error = await executeVoiceJob(confirmed);
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
  if (!asset) {
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
    estimatedCostCents: scenesNeeded.length * estimateImageCostCents(imageProvider.name),
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
async function executeVisualJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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
      const result = await withRetry(() =>
        imageProvider.generate({ prompt: scene.visualDescription, ratio: params.ratio }),
      );

      const extension = result.contentType.includes("png") ? "png" : "jpg";
      const storageKey = `projects/${job.projectId}/scenes/${sceneId}/visual-${job.id}.${extension}`;
      const uploaded = await storageProvider.putObject({
        key: storageKey,
        body: result.image,
        contentType: result.contentType,
      });

      await db.insert(mediaAssets).values({
        projectId: job.projectId,
        jobId: job.id,
        sceneId,
        type: "scene_image",
        storageKey: uploaded.key,
        contentType: result.contentType,
        sizeBytes: uploaded.sizeBytes,
        provider: result.provider,
        model: result.model,
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

  const error = await executeVisualJob(confirmed);
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
  if (!asset) {
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

  await db
    .update(scenes)
    .set({
      narration: parsed.data.narration,
      visualDescription: parsed.data.visualDescription,
      audioDirection: parsed.data.audioDirection,
      durationSeconds: parsed.data.durationSeconds,
      version: scene.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, scene.id));

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
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
