"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { characters, generationJobs, mediaAssets, worldCharacters, worldReferences, worlds } from "@/db/schema";
import { loadOwnedWorld } from "@/lib/authz";
import { estimateImageCostCents } from "@/lib/cost-estimate";
import { cancelJob, confirmJob, isStalled, requestJob } from "@/lib/jobs";
import { imageProvider } from "@/lib/providers";
import { storageProvider } from "@/lib/storage-instance";
import { worldSchema } from "@/lib/validation";
import { worldImagesJobTask } from "@/trigger/world-images";

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
      ownerId: world.ownerId,
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

  try {
    await requestJob({
      ownerId: userId,
      worldId: world.id,
      type: "world_images",
      provider: imageProvider.name,
      model: null,
      idempotencyKey,
      params: { worldId: world.id, views },
      estimatedCostCents: views.length * estimateImageCostCents(imageProvider.name),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

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

  await worldImagesJobTask.trigger({ jobId: confirmed.id }, { idempotencyKey: confirmed.idempotencyKey });
  revalidatePath(`/worlds/${job.worldId}`);
  return { error: "" };
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

  await worldImagesJobTask.trigger({ jobId: job.id });
  revalidatePath(`/worlds/${job.worldId}`);
  return { error: "" };
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
