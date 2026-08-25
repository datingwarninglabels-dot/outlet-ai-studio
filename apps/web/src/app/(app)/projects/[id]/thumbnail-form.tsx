"use client";

import { useActionState, useState } from "react";
import { THUMBNAIL_STYLES } from "@/lib/validation";
import { requestThumbnails, updateThumbnailText } from "./thumbnail-actions";

const initialState = { error: "" };

export function GenerateThumbnailsForm({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestThumbnails, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Styles (pick up to 4)</legend>
        <div className="flex flex-wrap gap-2">
          {THUMBNAIL_STYLES.map((style) => (
            <label
              key={style.key}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm has-[:checked]:border-accent-teal"
            >
              <input
                type="checkbox"
                name="styles"
                value={style.key}
                defaultChecked={style.key === "dramatic" || style.key === "clean"}
              />
              {style.label}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        className="h-11 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Estimating cost..." : "Generate thumbnails"}
      </button>
    </form>
  );
}

export function ThumbnailCard({
  thumbnailId,
  imageUrl,
  style,
  headlineText,
}: {
  thumbnailId: string;
  imageUrl: string;
  style: string;
  headlineText: string;
}) {
  const [state, formAction, pending] = useActionState(updateThumbnailText, initialState);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
      <img src={imageUrl} alt={`${style} thumbnail`} className="w-full rounded" />
      <p className="text-xs uppercase tracking-wide text-muted">{style}</p>

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="thumbnailId" value={thumbnailId} />
        <input
          name="headlineText"
          defaultValue={headlineText}
          maxLength={120}
          className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
        />
        {state.error && (
          <p role="alert" className="text-xs text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Updating..." : "Update headline"}
        </button>
      </form>

      <div>
        <p className="mb-1 text-[10px] text-muted">Readability at small size</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- same signed URL, CSS-scaled for a readability check */}
        <img src={imageUrl} alt="" className="w-20 rounded border border-border" />
      </div>
    </div>
  );
}
