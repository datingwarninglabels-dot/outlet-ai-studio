"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandKits, continuityChecks, generationJobs, mediaAssets, projects, scenes, scripts } from "@/db/schema";
import { loadOwnedCharacter, loadOwnedProject, loadOwnedWorld } from "@/lib/authz";
import { isContinuityCheckerConfigured } from "@/lib/continuity-checker";
import {
  estimateAssemblyCostCents,
  estimateContinuityCheckCostCents,
  estimateGenerationCostCents,
  estimateImageCostCents,
  estimateTTSCostCents,
  estimateVideoCostCents,
} from "@/lib/cost-estimate";
import { cancelJob, confirmJob, isStalled, requestJob } from "@/lib/jobs";
import {
  assemblyProvider,
  imageProvider,
  ratioForPlatform,
  shotstackAspectRatioForPlatform,
  storyboardProvider,
  ttsProvider,
  videoProvider,
} from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { projectOverridesSchema, sceneUpdateSchema } from "@/lib/validation";
import { animationJobTask } from "@/trigger/animation";
import { assemblyJobTask } from "@/trigger/assembly";
import { scriptJobTask } from "@/trigger/script";
import { storyboardJobTask } from "@/trigger/storyboard";
import { visualJobTask } from "@/trigger/visual";
import { voiceJobTask } from "@/trigger/voice";

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
export type ProjectJob = typeof generationJobs.$inferSelect & { projectId: string };

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

  await scriptJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await scriptJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await storyboardJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await storyboardJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  // Section 17: a project's voiceIdOverride wins; otherwise fall back to
  // the Owner's Brand Kit default voice, if set. Resolved once here (at
  // request time) rather than at execute time, same as every other job's
  // params — what actually runs is locked in at confirmation.
  const [brandKit] = await db.select().from(brandKits).where(eq(brandKits.ownerId, session.user.id)).limit(1);
  const effectiveVoiceId = project.voiceIdOverride ?? brandKit?.defaultVoiceId ?? undefined;

  await requestJob({
    projectId: project.id,
    type: "voice",
    provider: ttsProvider.name,
    model: null,
    idempotencyKey,
    params: { narration, voiceId: effectiveVoiceId },
    estimatedCostCents: estimateTTSCostCents({
      provider: ttsProvider.name,
      characterCount: narration.length,
    }),
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
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

  await voiceJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await voiceJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await visualJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await visualJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await animationJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await animationJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await assemblyJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await assemblyJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

// --- Section 17: per-project Brand Kit overrides. Empty clears back to
// inheriting the Owner's Brand Kit default; only future visual/voice
// generations are affected, nothing already generated is touched. ---

export async function updateProjectOverrides(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId, session.user.id);

  const parsed = projectOverridesSchema.safeParse({
    visualStyleOverride: formData.get("visualStyleOverride"),
    voiceIdOverride: formData.get("voiceIdOverride"),
  });
  if (!parsed.success) {
    return { error: "Check the override fields." };
  }

  await db
    .update(projects)
    .set({
      visualStyleOverride: parsed.data.visualStyleOverride,
      voiceIdOverride: parsed.data.voiceIdOverride,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}
