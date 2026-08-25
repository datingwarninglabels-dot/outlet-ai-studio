"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { characters, generationJobs, mediaAssets, worldCharacters, worldReferences, worlds } from "@/db/schema";
import { loadOwnedWorld } from "@/lib/authz";
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
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { worldSchema } from "@/lib/validation";
import { buildWorldPrompt } from "@/lib/world-prompt";

type ActionState = { error: string };

async function getOwnedJob(jobId: string, userId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job || !job.worldId) {
    throw new Error("Job not found.");
  }
  await loadOwnedWorld(job.worldId, userId);
  return job;
}

function readWorldFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    locationDescription: String(formData.get("locationDescription") ?? ""),
    propsVehicles: String(formData.get("propsVehicles") ?? ""),
    outfitsAccessories: String(formData.get("outfitsAccessories") ?? ""),
    lightingPalette: String(formData.get("lightingPalette") ?? ""),
    cameraStyle: String(formData.get("cameraStyle") ?? ""),
    animationStyle: String(formData.get("animationStyle") ?? ""),
    timeOfDay: String(formData.get("timeOfDay") ?? ""),
    weather: String(formData.get("weather") ?? ""),
    negativePrompt: String(formData.get("negativePrompt") ?? ""),
  };
}

async function syncAssignedCharacters(worldId: string, ownerId: string, formData: FormData) {
  const requestedIds = new Set(formData.getAll("characterIds").map(String));

  const owned = await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId));
  const ownedIds = new Set(owned.map((c) => c.id));

  const current = await db
    .select({ characterId: worldCharacters.characterId })
    .from(worldCharacters)
    .where(eq(worldCharacters.worldId, worldId));
  const currentIds = new Set(current.map((c) => c.characterId));

  const toAdd = [...requestedIds].filter((id) => ownedIds.has(id) && !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !requestedIds.has(id));

  for (const characterId of toAdd) {
    await db.insert(worldCharacters).values({ worldId, characterId }).onConflictDoNothing();
  }
  for (const characterId of toRemove) {
    await db
      .delete(worldCharacters)
      .where(and(eq(worldCharacters.worldId, worldId), eq(worldCharacters.characterId, characterId)));
  }
}

export async function createWorld(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = worldSchema.safeParse(readWorldFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the world fields." };
  }

  const [world] = await db
    .insert(worlds)
    .values({ ownerId: session.user.id, ...parsed.data })
    .returning();

  await syncAssignedCharacters(world.id, session.user.id, formData);
  redirect(`/worlds/${world.id}`);
}

export async function updateWorld(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const worldId = String(formData.get("worldId") ?? "");
  await loadOwnedWorld(worldId, session.user.id);

  const parsed = worldSchema.safeParse(readWorldFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the world fields." };
  }

  await db
    .update(worlds)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(worlds.id, worldId));

  await syncAssignedCharacters(worldId, session.user.id, formData);

  revalidatePath(`/worlds/${worldId}`);
  return { error: "" };
}

export async function deleteWorld(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const worldId = String(formData.get("worldId") ?? "");
  await loadOwnedWorld(worldId, session.user.id);

  const refs = await db.select().from(worldReferences).where(eq(worldReferences.worldId, worldId));

  for (const ref of refs) {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, ref.mediaAssetId)).limit(1);
    if (asset) {
      try {
        await storageProvider.deleteObject(asset.storageKey);
      } catch {
        // Best-effort — don't let a storage hiccup block deleting the world record.
      }
      await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
    }
  }

  await db.delete(worlds).where(eq(worlds.id, worldId));
  redirect("/worlds");
}

export async function uploadReference(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const worldId = String(formData.get("worldId") ?? "");
  const world = await loadOwnedWorld(worldId, session.user.id);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Only image files are supported." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "Image must be under 10MB." };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split("/")[1] ?? "jpg";
  const storageKey = `worlds/${world.id}/uploads/${Date.now()}.${extension}`;
  const uploaded = await storageProvider.putObject({ key: storageKey, body: bytes, contentType: file.type });

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId: null,
      type: "world_reference",
      storageKey: uploaded.key,
      contentType: file.type,
      sizeBytes: uploaded.sizeBytes,
    })
    .returning();

  await db.insert(worldReferences).values({
    worldId: world.id,
    mediaAssetId: asset.id,
    viewType: "uploaded",
    source: "upload",
    approved: false,
  });

  revalidatePath(`/worlds/${world.id}`);
  return { error: "" };
}

export async function approveReference(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const referenceId = String(formData.get("referenceId") ?? "");
  const [ref] = await db.select().from(worldReferences).where(eq(worldReferences.id, referenceId)).limit(1);
  if (!ref) {
    return;
  }
  const world = await loadOwnedWorld(ref.worldId, session.user.id);

  await db.update(worldReferences).set({ approved: true }).where(eq(worldReferences.id, referenceId));
  revalidatePath(`/worlds/${world.id}`);
}

export async function rejectReference(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const referenceId = String(formData.get("referenceId") ?? "");
  const [ref] = await db.select().from(worldReferences).where(eq(worldReferences.id, referenceId)).limit(1);
  if (!ref) {
    return;
  }
  const world = await loadOwnedWorld(ref.worldId, session.user.id);

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, ref.mediaAssetId)).limit(1);
  await db.delete(worldReferences).where(eq(worldReferences.id, referenceId));
  if (asset) {
    try {
      await storageProvider.deleteObject(asset.storageKey);
    } catch {
      // Best-effort.
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  }

  revalidatePath(`/worlds/${world.id}`);
}

// --- World reference set generation / consistency test: request → confirm →
// run. Same shared-executor-with-a-different-view-list pattern as Character
// Library, resumable per view. ---

async function requestWorldImages(
  worldId: string,
  userId: string,
  idempotencyKey: string,
  views: string[],
): Promise<ActionState> {
  const world = await loadOwnedWorld(worldId, userId);

  if (!imageProvider.isConfigured()) {
    return {
      error:
        "World image generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  await requestJob({
    worldId: world.id,
    type: "world_images",
    provider: imageProvider.name,
    model: null,
    idempotencyKey,
    params: { worldId: world.id, views },
    estimatedCostCents: views.length * estimateImageCostCents(imageProvider.name),
  });

  revalidatePath(`/worlds/${world.id}`);
  return { error: "" };
}

export async function requestWorldReferenceSet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const worldId = String(formData.get("worldId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }
  return requestWorldImages(worldId, session.user.id, idempotencyKey, ["establishing", "detail"]);
}

export async function requestWorldConsistencyTest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const worldId = String(formData.get("worldId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }
  return requestWorldImages(worldId, session.user.id, idempotencyKey, ["consistency_test"]);
}

async function executeWorldImagesJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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

export async function confirmWorldImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/worlds/${job.worldId}`);
    return { error: "" };
  }

  const error = await executeWorldImagesJob(confirmed);
  revalidatePath(`/worlds/${job.worldId}`);
  return { error: error ?? "" };
}

export async function cancelWorldImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/worlds/${job.worldId}`);
  return { error: "" };
}

export async function retryWorldImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeWorldImagesJob(job);
  revalidatePath(`/worlds/${job.worldId}`);
  return { error: error ?? "" };
}

export async function getWorldImageUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset) {
    throw new Error("Media asset not found.");
  }

  const [ref] = await db.select().from(worldReferences).where(eq(worldReferences.mediaAssetId, asset.id)).limit(1);
  if (!ref) {
    throw new Error("Reference not found.");
  }
  await loadOwnedWorld(ref.worldId, session.user.id);

  return storageProvider.getSignedUrl(asset.storageKey);
}

export async function listOwnedWorlds(userId: string) {
  return db.select().from(worlds).where(eq(worlds.ownerId, userId)).orderBy(desc(worlds.createdAt));
}

export async function listAssignedCharacterIds(worldId: string): Promise<string[]> {
  const rows = await db
    .select({ characterId: worldCharacters.characterId })
    .from(worldCharacters)
    .where(eq(worldCharacters.worldId, worldId));
  return rows.map((r) => r.characterId);
}
