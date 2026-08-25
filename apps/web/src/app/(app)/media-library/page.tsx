import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { MEDIA_CATEGORIES } from "@/lib/media-categories";
import {
  getMediaAssetUrl,
  getStorageUsage,
  listMediaAssets,
  listTrashedMediaAssets,
  sweepExpiredTrash,
} from "./actions";
import { MediaCard, TrashCard } from "./media-card";
import { MediaUploadForm } from "./media-upload-form";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; category?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { project: projectFilter, category: categoryFilter } = await searchParams;

  await sweepExpiredTrash();

  const ownedProjects = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.ownerId, session.user.id));

  // A tampered/stale ?project= query param (the dropdown only ever submits
  // the Owner's own project ids) shouldn't crash the page — fall back to
  // the unfiltered list rather than letting the ownership check's throw
  // bubble up through this Server Component render.
  const validatedProjectFilter =
    projectFilter && ownedProjects.some((p) => p.id === projectFilter) ? projectFilter : undefined;

  const [assets, trashed, usage] = await Promise.all([
    listMediaAssets(session.user.id, { projectId: validatedProjectFilter, category: categoryFilter }),
    listTrashedMediaAssets(session.user.id),
    getStorageUsage(session.user.id),
  ]);

  const assetCards = await Promise.all(
    assets.map(async (asset) => ({ asset, url: await getMediaAssetUrl(asset.id) })),
  );

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Media Library</h1>
        <p className="mt-1 text-sm text-muted">
          Every generated and uploaded asset in one place — private by default, signed URLs only.
          Upload your own photos, art, videos, music, sound effects, voice recordings, scripts, and
          subtitle files for reuse across projects.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-muted">Storage usage</h2>
        <p className="text-sm">Total: {formatBytes(usage.totalBytes)}</p>
        {usage.byProject.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {usage.byProject.map((p) => (
              <li key={p.projectId ?? "none"}>
                {p.title}: {formatBytes(p.bytes)}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Plan-based storage limits aren&apos;t enforced yet — this is a foundation for that, not the
          feature itself.
        </p>
      </section>

      <MediaUploadForm projects={ownedProjects} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="project" className="text-xs text-muted">
            Filter by project
          </label>
          <select
            id="project"
            name="project"
            defaultValue={projectFilter ?? ""}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
          >
            <option value="">All</option>
            {ownedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-muted">
            Filter by category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter ?? ""}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
          >
            <option value="">All (includes generated media)</option>
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-surface-raised"
        >
          Apply filters
        </button>
      </form>

      {assetCards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
          No media matches these filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assetCards.map(({ asset, url }) => (
            <MediaCard
              key={asset.id}
              asset={{
                id: asset.id,
                name: asset.name,
                contentType: asset.contentType,
                sizeBytes: asset.sizeBytes,
                type: asset.type,
                projectId: asset.projectId,
                tags: (asset.tags as string[]) ?? [],
                metadata: asset.metadata,
                createdAt: asset.createdAt,
              }}
              url={url}
              projects={ownedProjects}
            />
          ))}
        </div>
      )}

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Trash ({trashed.length}) — recovery window is 30 days
        </summary>
        <div className="mt-4 flex flex-col gap-2">
          {trashed.length === 0 ? (
            <p className="text-sm text-muted">Nothing in Trash.</p>
          ) : (
            trashed.map((asset) => (
              <TrashCard
                key={asset.id}
                asset={{
                  id: asset.id,
                  name: asset.name,
                  type: asset.type,
                  sizeBytes: asset.sizeBytes,
                  deletedAt: asset.deletedAt,
                }}
              />
            ))
          )}
        </div>
      </details>

      <p className="text-xs text-muted">
        Type/size checks run on every upload; true malware/virus scanning isn&apos;t integrated with
        any provider yet. Compression/transcoding isn&apos;t performed — uploads are stored as-is, the
        same reasoning that kept ffmpeg out of this app&apos;s architecture (Vercel serverless risk).
      </p>
    </div>
  );
}
