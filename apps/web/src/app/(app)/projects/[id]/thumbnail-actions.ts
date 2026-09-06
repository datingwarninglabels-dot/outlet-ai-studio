"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, mediaAssets, thumbnails } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import { estimateImageCostCents } from "@/lib/cost-estimate";
import { cancelJob, confirmJob, isStalled, requestJob } from "@/lib/jobs";
import { imageProvider, thumbnailRatioForPlatform } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { overlayHeadline } from "@/lib/thumbnail-overlay";
import { THUMBNAIL_STYLES, thumbnailTextSchema } from "@/lib/validation";
import { thumbnailJobTask } from "@/trigger/thumbnail";

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

  try {
    await requestJob({
      ownerId: session.user.id,
      projectId: project.id,
      type: "thumbnail",
      provider: imageProvider.name,
      model: null,
      idempotencyKey,
      params: { styles, platform: project.platform ?? "Custom Project" },
      estimatedCostCents: styles.length * estimateImageCostCents(imageProvider.name),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
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

  await thumbnailJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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

  await thumbnailJobTask.trigger({ jobId: job.id });
  revalidatePath(`/projects/${job.projectId}`);
  return { error: "" };
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
      ownerId: session.user.id,
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
