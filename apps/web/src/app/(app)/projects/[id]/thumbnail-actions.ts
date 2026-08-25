"use server";

import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, mediaAssets, projects, scenes, thumbnails } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import { estimateImageCostCents } from "@/lib/cost-estimate";
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
import { imageProvider, thumbnailRatioForPlatform } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { overlayHeadline } from "@/lib/thumbnail-overlay";
import { THUMBNAIL_STYLES, thumbnailTextSchema } from "@/lib/validation";

type ActionState = { error: string };

// generation_jobs.projectId is nullable at the schema level (Character
// Library jobs use characterId instead) — this file only ever deals with
// project-scoped jobs, so narrow once here rather than at every use site.
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

function buildPrompt(projectTitle: string, sceneVisual: string | null, styleModifier: string): string {
  const subject = sceneVisual
    ? `${projectTitle} — ${sceneVisual}`
    : projectTitle;
  return `Thumbnail/cover image for a short-form video. Subject: ${subject}. Style: ${styleModifier}. Leave the lower third relatively uncluttered for text to be added afterward. No text or lettering in the image itself.`;
}

export async function requestThumbnails(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const styles = formData.getAll("styles").map(String).filter((s) => THUMBNAIL_STYLES.some((t) => t.key === s));
  if (styles.length === 0) {
    return { error: "Pick at least one style." };
  }
  if (styles.length > 4) {
    return { error: "Pick at most 4 styles per request — keeps cost predictable." };
  }

  if (!imageProvider.isConfigured()) {
    return {
      error:
        "Thumbnail generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  await requestJob({
    projectId: project.id,
    type: "thumbnail",
    provider: imageProvider.name,
    model: null,
    idempotencyKey,
    params: { styles, platform: project.platform ?? "Custom Project" },
    estimatedCostCents: styles.length * estimateImageCostCents(imageProvider.name),
  });

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

async function executeThumbnailJob(job: ProjectJob): Promise<string | null> {
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
  const projectTitle = projectRow?.title ?? "Untitled";
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

  await completeJob(job.id);
  return null;
}

export async function confirmThumbnails(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const error = await executeThumbnailJob(asProjectJob(confirmed));
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

export async function cancelThumbnails(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

export async function retryThumbnails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeThumbnailJob(job);
  revalidatePath(`/projects/${job.projectId}`);
  return { error: error ?? "" };
}

/** Free — re-composites the existing base image with new text, no provider call. */
export async function updateThumbnailText(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = thumbnailTextSchema.safeParse({
    thumbnailId: formData.get("thumbnailId"),
    headlineText: formData.get("headlineText"),
  });
  if (!parsed.success) {
    return { error: "Headline text is too long (max 120 characters)." };
  }

  const [thumbnail] = await db
    .select()
    .from(thumbnails)
    .where(eq(thumbnails.id, parsed.data.thumbnailId))
    .limit(1);
  if (!thumbnail) {
    return { error: "Thumbnail not found." };
  }
  await loadOwnedProject(thumbnail.projectId, session.user.id);

  const [baseAsset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, thumbnail.baseAssetId))
    .limit(1);
  if (!baseAsset) {
    return { error: "The base image for this thumbnail is missing." };
  }

  const { width, height } = thumbnailRatioForPlatform(thumbnail.platform);
  const baseBytes = await storageProvider.getObject(baseAsset.storageKey);
  const composited = await overlayHeadline(baseBytes, parsed.data.headlineText, width, height);

  const compositedKey = `projects/${thumbnail.projectId}/thumbnails/${thumbnail.id}-composited-${Date.now()}.png`;
  const uploaded = await storageProvider.putObject({
    key: compositedKey,
    body: composited,
    contentType: "image/png",
  });

  const [newAsset] = await db
    .insert(mediaAssets)
    .values({
      projectId: thumbnail.projectId,
      type: "thumbnail_composited",
      storageKey: uploaded.key,
      contentType: "image/png",
      sizeBytes: uploaded.sizeBytes,
      provider: baseAsset.provider,
      model: baseAsset.model,
    })
    .returning();

  await db
    .update(thumbnails)
    .set({ headlineText: parsed.data.headlineText, compositedAssetId: newAsset.id, updatedAt: new Date() })
    .where(eq(thumbnails.id, thumbnail.id));

  revalidatePath(`/projects/${thumbnail.projectId}`);
  return { error: "" };
}

export async function getThumbnailImageUrl(mediaAssetId: string): Promise<string> {
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
