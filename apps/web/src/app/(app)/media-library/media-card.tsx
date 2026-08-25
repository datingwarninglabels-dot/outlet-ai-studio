"use client";

import { useActionState, useState } from "react";
import {
  assignMediaAssetToProject,
  permanentlyDeleteMediaAsset,
  renameMediaAsset,
  restoreMediaAsset,
  trashMediaAsset,
  updateMediaAssetTags,
} from "./actions";

const initialState = { error: "" };

function previewKind(contentType: string): "image" | "video" | "audio" | "other" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function MediaCard({
  asset,
  url,
  projects,
}: {
  asset: {
    id: string;
    name: string | null;
    contentType: string;
    sizeBytes: number;
    type: string;
    projectId: string | null;
    tags: string[];
    metadata: unknown;
    createdAt: Date;
  };
  url: string;
  projects: { id: string; title: string }[];
}) {
  const [renameState, renameAction, renaming] = useActionState(renameMediaAsset, initialState);
  const [tagsState, tagsAction, savingTags] = useActionState(updateMediaAssetTags, initialState);
  const [assignState, assignAction, assigning] = useActionState(assignMediaAssetToProject, initialState);
  const [trashing, setTrashing] = useState(false);

  const kind = previewKind(asset.contentType);
  const category = (asset.metadata as { category?: string } | null)?.category;
  const displayName = asset.name ?? asset.type;
  const isStandaloneUpload = asset.type === "library_upload";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-background">
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset
          <img src={url} alt={displayName} className="h-full w-full object-cover" />
        )}
        {kind === "video" && <video controls src={url} className="h-full w-full object-cover" />}
        {kind === "audio" && <audio controls src={url} className="w-full px-2" />}
        {kind === "other" && (
          <a href={url} className="text-xs text-accent-teal underline">
            Download to preview
          </a>
        )}
      </div>

      <div>
        <p className="truncate text-sm font-medium" title={displayName}>
          {displayName}
        </p>
        <p className="text-xs text-muted">
          {category ?? asset.type} · {formatBytes(asset.sizeBytes)} · {asset.createdAt.toLocaleDateString()}
        </p>
      </div>

      <form action={renameAction} className="flex gap-1">
        <input type="hidden" name="mediaAssetId" value={asset.id} />
        <input
          name="name"
          defaultValue={asset.name ?? ""}
          placeholder="Rename..."
          maxLength={200}
          className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus-visible:border-accent-teal"
        />
        <button
          type="submit"
          disabled={renaming}
          className="h-8 rounded border border-border px-2 text-xs hover:bg-surface-raised disabled:opacity-60"
        >
          {renaming ? "..." : "Save"}
        </button>
      </form>
      {renameState.error && <p className="text-xs text-red-400">{renameState.error}</p>}

      <form action={tagsAction} className="flex gap-1">
        <input type="hidden" name="mediaAssetId" value={asset.id} />
        <input
          name="tags"
          defaultValue={asset.tags.join(", ")}
          placeholder="tags, comma-separated"
          maxLength={300}
          className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus-visible:border-accent-teal"
        />
        <button
          type="submit"
          disabled={savingTags}
          className="h-8 rounded border border-border px-2 text-xs hover:bg-surface-raised disabled:opacity-60"
        >
          {savingTags ? "..." : "Tag"}
        </button>
      </form>
      {tagsState.error && <p className="text-xs text-red-400">{tagsState.error}</p>}

      {isStandaloneUpload && projects.length > 0 && (
        <form action={assignAction} className="flex gap-1">
          <input type="hidden" name="mediaAssetId" value={asset.id} />
          <select
            name="projectId"
            defaultValue={asset.projectId ?? ""}
            className="h-8 flex-1 rounded border border-border bg-background px-1 text-xs outline-none focus-visible:border-accent-teal"
          >
            <option value="">Shared library</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={assigning}
            className="h-8 rounded border border-border px-2 text-xs hover:bg-surface-raised disabled:opacity-60"
          >
            {assigning ? "..." : "Reuse in"}
          </button>
        </form>
      )}
      {assignState.error && <p className="text-xs text-red-400">{assignState.error}</p>}

      <div className="flex gap-2">
        <a
          href={url}
          download
          className="h-8 flex-1 rounded border border-border px-2 text-center text-xs leading-8 hover:bg-surface-raised"
        >
          Download
        </a>
        {isStandaloneUpload ? (
          <form action={trashMediaAsset} onSubmit={() => setTrashing(true)} className="flex-1">
            <input type="hidden" name="mediaAssetId" value={asset.id} />
            <button
              type="submit"
              disabled={trashing}
              className="h-8 w-full rounded border border-red-400/40 px-2 text-xs text-red-400 hover:bg-red-400/10 disabled:opacity-60"
            >
              {trashing ? "..." : "Move to Trash"}
            </button>
          </form>
        ) : (
          <p className="flex h-8 flex-1 items-center justify-center text-center text-[10px] text-muted">
            Generated — manage from its own page
          </p>
        )}
      </div>
    </div>
  );
}

export function TrashCard({
  asset,
}: {
  asset: { id: string; name: string | null; type: string; sizeBytes: number; deletedAt: Date | null };
}) {
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm">
      <div>
        <p>{asset.name ?? asset.type}</p>
        <p className="text-xs text-muted">
          {formatBytes(asset.sizeBytes)} · trashed {asset.deletedAt?.toLocaleDateString() ?? "?"}
        </p>
      </div>
      <div className="flex gap-2">
        <form action={restoreMediaAsset} onSubmit={() => setRestoring(true)}>
          <input type="hidden" name="mediaAssetId" value={asset.id} />
          <button
            type="submit"
            disabled={restoring}
            className="h-8 rounded border border-border px-3 text-xs hover:bg-surface-raised disabled:opacity-60"
          >
            {restoring ? "..." : "Restore"}
          </button>
        </form>
        <form action={permanentlyDeleteMediaAsset} onSubmit={() => setDeleting(true)}>
          <input type="hidden" name="mediaAssetId" value={asset.id} />
          <button
            type="submit"
            disabled={deleting}
            className="h-8 rounded border border-red-400/40 px-3 text-xs text-red-400 hover:bg-red-400/10 disabled:opacity-60"
          >
            {deleting ? "..." : "Delete permanently"}
          </button>
        </form>
      </div>
    </div>
  );
}
