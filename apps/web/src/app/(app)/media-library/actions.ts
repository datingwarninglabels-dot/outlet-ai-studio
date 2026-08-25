"use server";

import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { mediaAssets, projects } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";
import { MEDIA_CATEGORIES, type MediaCategoryKey } from "@/lib/media-categories";
import { storageProvider } from "@/lib/storage-instance";

type ActionState = { error: string };

// Section 17: "Trash with a recovery window before permanent deletion."
// There's no background job/cron in this app (a deliberate M1.5 decision —
// execution stays in-process, driven by explicit Owner actions), so the
// window is enforced lazily: sweepExpiredTrash() runs whenever the Media
// Library page loads and permanently removes anything past it.
const RECOVERY_WINDOW_DAYS = 30;

const MAX_BYTES: Record<(typeof MEDIA_CATEGORIES)[number]["kind"], number> = {
  image: 10 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  text: 2 * 1024 * 1024,
};

const TEXT_EXTENSIONS: Record<string, string[]> = {
  script: ["txt", "md"],
  subtitle: ["srt", "vtt"],
};

/**
 * Security review finding: media_asset has no ownerId column (see the
 * table's own schema comment for why), so per-asset ownership can only be
 * verified when a row is tied to a project — every other action in this
 * app that resolves a resource by id (loadOwnedProject/loadOwnedCharacter/
 * loadOwnedWorld) does exactly this kind of check, and Media Library's
 * mutation/lookup actions were missing it. A project-less asset (character/
 * world reference, brand kit asset, standalone library upload) has no
 * per-owner boundary to check at all in the current schema — reachable by
 * construction only because this is a single-Owner, bootstrap-locked app
 * (see setup/actions.ts's advisory-lock fix, which is what actually keeps
 * that invariant true under concurrent requests).
 */
async function assertAssetReachableByOwner(
  asset: { projectId: string | null },
  ownerId: string,
): Promise<boolean> {
  if (!asset.projectId) {
    return true;
  }
  try {
    await loadOwnedProject(asset.projectId, ownerId);
    return true;
  } catch {
    return false;
  }
}

export async function sweepExpiredTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const expired = await db
    .select()
    .from(mediaAssets)
    .where(and(isNotNull(mediaAssets.deletedAt), lt(mediaAssets.deletedAt, cutoff)));

  for (const asset of expired) {
    try {
      await storageProvider.deleteObject(asset.storageKey);
    } catch {
      // Best-effort — don't let a storage hiccup block the sweep for other rows.
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  }
}

/**
 * ownerId is required (not just "an authenticated session exists") so a
 * projectId filter can be verified rather than trusted outright — see
 * assertAssetReachableByOwner's doc comment. An unowned projectId is
 * rejected rather than silently ignored, since silently falling back to
 * "show everything" would be a worse failure mode for a filter the caller
 * explicitly asked for.
 */
export async function listMediaAssets(
  ownerId: string,
  filters: { projectId?: string; category?: string },
) {
  if (filters.projectId) {
    await loadOwnedProject(filters.projectId, ownerId);
  }

  const conditions = [isNull(mediaAssets.deletedAt)];
  if (filters.projectId) {
    conditions.push(eq(mediaAssets.projectId, filters.projectId));
  }
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt));

  let reachable = rows;
  if (!filters.projectId) {
    // Batch the ownership check instead of one query per row: fetch this
    // owner's project ids once, then a row is reachable if it has no
    // project (see assertAssetReachableByOwner) or its project is in that set.
    const ownedProjectIds = new Set(
      (await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, ownerId))).map((p) => p.id),
    );
    reachable = rows.filter((r) => !r.projectId || ownedProjectIds.has(r.projectId));
  }

  if (!filters.category) {
    return reachable;
  }
  return reachable.filter((r) => (r.metadata as { category?: string } | null)?.category === filters.category);
}

export async function listTrashedMediaAssets(ownerId: string) {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(isNotNull(mediaAssets.deletedAt))
    .orderBy(desc(mediaAssets.deletedAt));

  const ownedProjectIds = new Set(
    (await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, ownerId))).map((p) => p.id),
  );
  return rows.filter((r) => !r.projectId || ownedProjectIds.has(r.projectId));
}

export async function getStorageUsage(ownerId: string): Promise<{
  totalBytes: number;
  byProject: { projectId: string | null; title: string; bytes: number }[];
}> {
  const ownedProjects = await db.select({ id: projects.id, title: projects.title }).from(projects).where(
    eq(projects.ownerId, ownerId),
  );
  const titleById = new Map(ownedProjects.map((p) => [p.id, p.title]));
  const ownedProjectIds = new Set(ownedProjects.map((p) => p.id));

  const rows = await db
    .select({
      projectId: mediaAssets.projectId,
      sizeBytes: mediaAssets.sizeBytes,
    })
    .from(mediaAssets)
    .where(isNull(mediaAssets.deletedAt));

  const reachableRows = rows.filter((r) => !r.projectId || ownedProjectIds.has(r.projectId));
  const totalBytes = reachableRows.reduce((sum, r) => sum + r.sizeBytes, 0);

  const byProjectId = new Map<string | null, number>();
  for (const r of reachableRows) {
    byProjectId.set(r.projectId, (byProjectId.get(r.projectId) ?? 0) + r.sizeBytes);
  }

  const byProject = [...byProjectId.entries()].map(([projectId, bytes]) => ({
    projectId,
    title: projectId ? (titleById.get(projectId) ?? "Deleted project") : "Not tied to a project",
    bytes,
  }));

  return { totalBytes, byProject };
}

export async function uploadMedia(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const category = String(formData.get("category") ?? "") as MediaCategoryKey;
  const categoryDef = MEDIA_CATEGORIES.find((c) => c.key === category);
  if (!categoryDef) {
    return { error: "Pick a media category." };
  }

  const projectId = String(formData.get("projectId") ?? "") || null;
  if (projectId) {
    try {
      await loadOwnedProject(projectId, session.user.id);
    } catch {
      return { error: "That project wasn't found." };
    }
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file." };
  }

  if (categoryDef.kind === "text") {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = TEXT_EXTENSIONS[category] ?? [];
    if (!allowed.includes(extension)) {
      return { error: `That file type isn't a ${categoryDef.label.toLowerCase()} (expected .${allowed.join(" or .")}).` };
    }
  } else if (!file.type.startsWith(`${categoryDef.kind}/`)) {
    return { error: `Only ${categoryDef.kind} files are supported for ${categoryDef.label.toLowerCase()}.` };
  }

  if (file.size > MAX_BYTES[categoryDef.kind]) {
    return { error: `File is too large for a ${categoryDef.label.toLowerCase()} upload.` };
  }
  if (!storageProvider.isConfigured()) {
    return {
      error:
        "Private storage isn't connected yet — set STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY and restart the app.",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const storageKey = `${projectId ? `projects/${projectId}` : "library"}/uploads/${Date.now()}-${safeName}`;
  const uploaded = await storageProvider.putObject({
    key: storageKey,
    body: bytes,
    contentType: file.type || "application/octet-stream",
  });

  await db.insert(mediaAssets).values({
    projectId,
    type: "library_upload",
    storageKey: uploaded.key,
    contentType: file.type || "application/octet-stream",
    sizeBytes: uploaded.sizeBytes,
    name: file.name,
    metadata: { category },
  });

  revalidatePath("/media-library");
  return { error: "" };
}

export async function renameMediaAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return { error: "Media asset not found." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);

  await db.update(mediaAssets).set({ name: name || null }).where(eq(mediaAssets.id, mediaAssetId));
  revalidatePath("/media-library");
  return { error: "" };
}

export async function updateMediaAssetTags(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return { error: "Media asset not found." };
  }

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  await db.update(mediaAssets).set({ tags }).where(eq(mediaAssets.id, mediaAssetId));
  revalidatePath("/media-library");
  return { error: "" };
}

/**
 * "Reuse" (Section 17): assign a library-wide asset to a project, or move
 * it between projects. Only safe for standalone uploads (no jobId/sceneId)
 * — a generation output (a scene's image, a voice track, ...) is keyed to
 * a specific job/scene elsewhere in the app, so reassigning its projectId
 * alone would silently orphan those references rather than actually "reuse"
 * anything. Clearing projectId returns an upload to the shared library.
 */
export async function assignMediaAssetToProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return { error: "Media asset not found." };
  }
  if (asset.jobId || asset.sceneId) {
    return { error: "Generated media is tied to its own project and can't be reassigned." };
  }

  const projectId = String(formData.get("projectId") ?? "") || null;
  if (projectId) {
    try {
      await loadOwnedProject(projectId, session.user.id);
    } catch {
      return { error: "That project wasn't found." };
    }
  }

  await db.update(mediaAssets).set({ projectId }).where(eq(mediaAssets.id, mediaAssetId));
  revalidatePath("/media-library");
  return { error: "" };
}

/**
 * Trash is only offered in the UI for standalone uploads (type ===
 * "library_upload"). Generated media (scene images, thumbnails, character/
 * world references, brand kit assets, final videos) is looked up directly
 * by other pages via mediaAssets — none of them check deletedAt, so soft-
 * deleting one here would leave it visibly broken elsewhere the moment the
 * recovery-window sweep actually removes the storage object. This check is
 * defense-in-depth for a hand-crafted request; the UI never renders the
 * button for those assets in the first place.
 */
export async function trashMediaAsset(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || asset.type !== "library_upload" || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return;
  }
  await db.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, mediaAssetId));
  revalidatePath("/media-library");
}

export async function restoreMediaAsset(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return;
  }
  await db.update(mediaAssets).set({ deletedAt: null }).where(eq(mediaAssets.id, mediaAssetId));
  revalidatePath("/media-library");
}

export async function permanentlyDeleteMediaAsset(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const mediaAssetId = String(formData.get("mediaAssetId") ?? "");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    return;
  }
  try {
    await storageProvider.deleteObject(asset.storageKey);
  } catch {
    // Best-effort.
  }
  await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  revalidatePath("/media-library");
}

export async function getMediaAssetUrl(mediaAssetId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset || !(await assertAssetReachableByOwner(asset, session.user.id))) {
    throw new Error("Media asset not found.");
  }
  return storageProvider.getSignedUrl(asset.storageKey);
}
