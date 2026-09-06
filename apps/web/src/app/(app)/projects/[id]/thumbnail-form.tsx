"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input, useActionToast } from "@/components/ui";
import { THUMBNAIL_STYLES } from "@/lib/validation";
import { requestThumbnails, updateThumbnailText } from "./thumbnail-actions";
import { GenerateError } from "./generate-error";

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
  useActionToast(state, pending, "Thumbnails requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Styles (pick up to 4)</legend>
        <div className="flex flex-wrap gap-2">
          {THUMBNAIL_STYLES.map((style) => (
            <label
              key={style.key}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
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
      <GenerateError error={state.error} />
      <Button
        type="submit"
        pending={pending}
        pendingLabel="Estimating cost…"
        disabled={Boolean(disabledReason)}
        className="w-fit"
      >
        Generate thumbnails
      </Button>
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
  useActionToast(state, pending, "Headline updated.");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
      <img src={imageUrl} alt={`${style} thumbnail`} loading="lazy" className="w-full rounded" />
      <p className="text-xs uppercase tracking-wide text-muted">{style}</p>

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="thumbnailId" value={thumbnailId} />
        <Input name="headlineText" aria-label={`Headline for ${style} thumbnail`} defaultValue={headlineText} maxLength={120} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Updating…" fullWidth>
          Update headline
        </Button>
      </form>

      <div>
        <p className="mb-1 text-xs text-muted">Readability at small size</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- same signed URL, CSS-scaled for a readability check */}
        <img src={imageUrl} alt="" loading="lazy" className="w-20 rounded border border-border" />
      </div>
    </div>
  );
}
