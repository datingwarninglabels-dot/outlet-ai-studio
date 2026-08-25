"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandKits, mediaAssets } from "@/db/schema";
import { brandKitSchema } from "@/lib/validation";
import { storageProvider } from "@/lib/storage-instance";

type ActionState = { error: string };

export async function getOrCreateBrandKit(ownerId: string) {
  const [existing] = await db.select().from(brandKits).where(eq(brandKits.ownerId, ownerId)).limit(1);
  if (existing) {
    return existing;
  }
  const [created] = await db.insert(brandKits).values({ ownerId }).onConflictDoNothing().returning();
  if (created) {
    return created;
  }
  // Lost a race with a concurrent create — re-select rather than fail.
  const [afterRace] = await db.select().from(brandKits).where(eq(brandKits.ownerId, ownerId)).limit(1);
  return afterRace;
}

function parseColors(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function updateBrandKit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const brandKit = await getOrCreateBrandKit(session.user.id);

  const parsed = brandKitSchema.safeParse({
    colors: parseColors(String(formData.get("colors") ?? "")),
    fonts: String(formData.get("fonts") ?? ""),
    captionStyle: String(formData.get("captionStyle") ?? ""),
    watermarkEnabled: formData.get("watermarkEnabled") === "on",
    watermarkText: String(formData.get("watermarkText") ?? ""),
    defaultVoiceId: String(formData.get("defaultVoiceId") ?? ""),
    defaultMusicMood: String(formData.get("defaultMusicMood") ?? ""),
    defaultVisualStyle: String(formData.get("defaultVisualStyle") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Brand Kit fields." };
  }

  await db
    .update(brandKits)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(brandKits.id, brandKit.id));

  revalidatePath("/brand-kit");
  return { error: "" };
}

async function uploadBrandAsset(
  formData: FormData,
  slot: "logoAssetId" | "introAssetId" | "outroAssetId",
  assetType: string,
  accept: "image" | "video",
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const brandKit = await getOrCreateBrandKit(session.user.id);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file." };
  }
  if (!file.type.startsWith(`${accept}/`)) {
    return { error: `Only ${accept} files are supported here.` };
  }
  const maxBytes = accept === "video" ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { error: `File must be under ${accept === "video" ? "200MB" : "10MB"}.` };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split("/")[1] ?? "bin";
  const storageKey = `brand-kit/${session.user.id}/${assetType}-${Date.now()}.${extension}`;
  const uploaded = await storageProvider.putObject({ key: storageKey, body: bytes, contentType: file.type });

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId: null,
      type: assetType,
      storageKey: uploaded.key,
      contentType: file.type,
      sizeBytes: uploaded.sizeBytes,
    })
    .returning();

  const previousAssetId = brandKit[slot];
  await db
    .update(brandKits)
    .set({ [slot]: asset.id, updatedAt: new Date() })
    .where(eq(brandKits.id, brandKit.id));

  if (previousAssetId) {
    const [previousAsset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, previousAssetId)).limit(1);
    if (previousAsset) {
      try {
        await storageProvider.deleteObject(previousAsset.storageKey);
      } catch {
        // Best-effort.
      }
      await db.delete(mediaAssets).where(eq(mediaAssets.id, previousAsset.id));
    }
  }

  revalidatePath("/brand-kit");
  return { error: "" };
}

export async function uploadLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return uploadBrandAsset(formData, "logoAssetId", "brand_logo", "image");
}

export async function uploadIntro(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return uploadBrandAsset(formData, "introAssetId", "brand_intro", "video");
}

export async function uploadOutro(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return uploadBrandAsset(formData, "outroAssetId", "brand_outro", "video");
}

export async function getBrandAssetUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset) {
    throw new Error("Media asset not found.");
  }

  const brandKit = await getOrCreateBrandKit(session.user.id);
  const isBrandAsset =
    brandKit.logoAssetId === asset.id || brandKit.introAssetId === asset.id || brandKit.outroAssetId === asset.id;
  if (!isBrandAsset) {
    throw new Error("Media asset not found.");
  }

  return storageProvider.getSignedUrl(asset.storageKey);
}
