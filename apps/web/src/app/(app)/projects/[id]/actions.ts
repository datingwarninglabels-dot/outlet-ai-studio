"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, scenes, scripts } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import { estimateGenerationCostCents } from "@/lib/cost-estimate";
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
import { scriptProvider, storyboardProvider } from "@/lib/providers";
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
