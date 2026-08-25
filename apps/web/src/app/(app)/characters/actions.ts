"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { characterReferences, characters, generationJobs, mediaAssets } from "@/db/schema";
import { loadOwnedCharacter } from "@/lib/authz";
import { buildCharacterPrompt } from "@/lib/character-prompt";
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
import { characterSchema } from "@/lib/validation";

type ActionState = { error: string };

async function getOwnedJob(jobId: string, userId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  if (!job || !job.characterId) {
    throw new Error("Job not found.");
  }
  await loadOwnedCharacter(job.characterId, userId);
  return job;
}

function readCharacterFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    face: String(formData.get("face") ?? ""),
    skinTone: String(formData.get("skinTone") ?? ""),
    hair: String(formData.get("hair") ?? ""),
    bodyType: String(formData.get("bodyType") ?? ""),
    apparentAge: String(formData.get("apparentAge") ?? ""),
    distinguishingDetails: String(formData.get("distinguishingDetails") ?? ""),
    defaultClothing: String(formData.get("defaultClothing") ?? ""),
    accessories: String(formData.get("accessories") ?? ""),
    palette: String(formData.get("palette") ?? ""),
    negativePrompt: String(formData.get("negativePrompt") ?? ""),
    assignedVoiceId: String(formData.get("assignedVoiceId") ?? ""),
    isRealPerson: formData.get("isRealPerson") === "on",
    permissionNotes: String(formData.get("permissionNotes") ?? ""),
  };
}

export async function createCharacter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = characterSchema.safeParse(readCharacterFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the character fields." };
  }

  const [character] = await db
    .insert(characters)
    .values({ ownerId: session.user.id, ...parsed.data })
    .returning();

  redirect(`/characters/${character.id}`);
}

export async function updateCharacter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const characterId = String(formData.get("characterId") ?? "");
  await loadOwnedCharacter(characterId, session.user.id);

  const parsed = characterSchema.safeParse(readCharacterFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the character fields." };
  }

  await db
    .update(characters)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(characters.id, characterId));

  revalidatePath(`/characters/${characterId}`);
  return { error: "" };
}

export async function deleteCharacter(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const characterId = String(formData.get("characterId") ?? "");
  await loadOwnedCharacter(characterId, session.user.id);

  const refs = await db
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.characterId, characterId));

  for (const ref of refs) {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, ref.mediaAssetId)).limit(1);
    if (asset) {
      try {
        await storageProvider.deleteObject(asset.storageKey);
      } catch {
        // Best-effort — don't let a storage hiccup block deleting the character record.
      }
      await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
    }
  }

  await db.delete(characters).where(eq(characters.id, characterId));
  redirect("/characters");
}

export async function uploadReference(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const characterId = String(formData.get("characterId") ?? "");
  const character = await loadOwnedCharacter(characterId, session.user.id);

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
  const storageKey = `characters/${character.id}/uploads/${Date.now()}.${extension}`;
  const uploaded = await storageProvider.putObject({ key: storageKey, body: bytes, contentType: file.type });

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId: null,
      type: "character_reference",
      storageKey: uploaded.key,
      contentType: file.type,
      sizeBytes: uploaded.sizeBytes,
    })
    .returning();

  await db.insert(characterReferences).values({
    characterId: character.id,
    mediaAssetId: asset.id,
    viewType: "uploaded",
    source: "upload",
    approved: false,
  });

  revalidatePath(`/characters/${character.id}`);
  return { error: "" };
}

export async function approveReference(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const referenceId = String(formData.get("referenceId") ?? "");
  const [ref] = await db
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.id, referenceId))
    .limit(1);
  if (!ref) {
    return;
  }
  const character = await loadOwnedCharacter(ref.characterId, session.user.id);

  await db.update(characterReferences).set({ approved: true }).where(eq(characterReferences.id, referenceId));
  revalidatePath(`/characters/${character.id}`);
}

export async function rejectReference(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const referenceId = String(formData.get("referenceId") ?? "");
  const [ref] = await db
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.id, referenceId))
    .limit(1);
  if (!ref) {
    return;
  }
  const character = await loadOwnedCharacter(ref.characterId, session.user.id);

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, ref.mediaAssetId)).limit(1);
  await db.delete(characterReferences).where(eq(characterReferences.id, referenceId));
  if (asset) {
    try {
      await storageProvider.deleteObject(asset.storageKey);
    } catch {
      // Best-effort.
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  }

  revalidatePath(`/characters/${character.id}`);
}

// --- Character sheet generation / consistency test: request → confirm →
// run. Both are the same operation with a different view list, so they
// share one job type/executor rather than duplicating it. Resumable per
// view, same pattern as Visual/Animation/Thumbnails. ---

async function requestCharacterImages(
  characterId: string,
  userId: string,
  idempotencyKey: string,
  views: string[],
): Promise<ActionState> {
  const character = await loadOwnedCharacter(characterId, userId);

  if (!imageProvider.isConfigured()) {
    return {
      error:
        "Character image generation isn't connected yet — add RUNWAYML_API_SECRET to your environment and restart the app.",
    };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  await requestJob({
    characterId: character.id,
    type: "character_images",
    provider: imageProvider.name,
    model: null,
    idempotencyKey,
    params: { characterId: character.id, views },
    estimatedCostCents: views.length * estimateImageCostCents(imageProvider.name),
  });

  revalidatePath(`/characters/${character.id}`);
  return { error: "" };
}

export async function requestCharacterSheet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const characterId = String(formData.get("characterId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }
  return requestCharacterImages(characterId, session.user.id, idempotencyKey, [
    "front",
    "side",
    "close_up",
    "full_body",
  ]);
}

export async function requestConsistencyTest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const characterId = String(formData.get("characterId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }
  return requestCharacterImages(characterId, session.user.id, idempotencyKey, ["consistency_test"]);
}

async function executeCharacterImagesJob(job: typeof generationJobs.$inferSelect): Promise<string | null> {
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

  await completeJob(job.id);
  return null;
}

export async function confirmCharacterImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  const confirmed = await confirmJob(jobId);
  if (confirmed.status !== "running") {
    revalidatePath(`/characters/${job.characterId}`);
    return { error: "" };
  }

  const error = await executeCharacterImagesJob(confirmed);
  revalidatePath(`/characters/${job.characterId}`);
  return { error: error ?? "" };
}

export async function cancelCharacterImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);
  await cancelJob(jobId);
  revalidatePath(`/characters/${job.characterId}`);
  return { error: "" };
}

export async function retryCharacterImages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const jobId = String(formData.get("jobId") ?? "");
  const job = await getOwnedJob(jobId, session.user.id);

  if (!isStalled(job)) {
    return { error: "This job isn't stalled." };
  }

  const error = await executeCharacterImagesJob(job);
  revalidatePath(`/characters/${job.characterId}`);
  return { error: error ?? "" };
}

export async function getCharacterImageUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset) {
    throw new Error("Media asset not found.");
  }

  const [ref] = await db
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.mediaAssetId, asset.id))
    .limit(1);
  if (!ref) {
    throw new Error("Reference not found.");
  }
  await loadOwnedCharacter(ref.characterId, session.user.id);

  return storageProvider.getSignedUrl(asset.storageKey);
}

export async function listOwnedCharacters(userId: string) {
  return db.select().from(characters).where(eq(characters.ownerId, userId)).orderBy(desc(characters.createdAt));
}
