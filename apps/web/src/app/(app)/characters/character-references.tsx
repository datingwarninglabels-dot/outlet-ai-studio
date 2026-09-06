"use client";

import { useActionState, useState } from "react";
import { Alert, Badge, Button, useActionToast } from "@/components/ui";
import { approveReference, rejectReference, uploadReference } from "./actions";

const initialState = { error: "" };

export function UploadReferenceForm({ characterId }: { characterId: string }) {
  const [state, formAction, pending] = useActionState(uploadReference, initialState);
  useActionToast(state, pending, "Reference image uploaded.");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="characterId" value={characterId} />
      <input
        type="file"
        name="file"
        accept="image/*"
        required
        aria-label="Reference image file"
        className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-sm"
      />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Uploading…" className="w-fit">
        Upload reference image
      </Button>
    </form>
  );
}

export function ReferenceCard({
  referenceId,
  imageUrl,
  viewType,
  source,
  approved,
}: {
  referenceId: string;
  imageUrl: string;
  viewType: string;
  source: string;
  approved: boolean;
}) {
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
      <img src={imageUrl} alt={viewType} loading="lazy" className="w-full rounded" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {viewType} · {source}
        </p>
        {approved && <Badge tone="success">Approved</Badge>}
      </div>
      {!approved && (
        <div className="flex gap-2">
          <form action={approveReference} onSubmit={() => setPendingAction("approve")}>
            <input type="hidden" name="referenceId" value={referenceId} />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pendingAction !== null}
              pending={pendingAction === "approve"}
              pendingLabel="Approving…"
            >
              Approve
            </Button>
          </form>
          <form action={rejectReference} onSubmit={() => setPendingAction("reject")}>
            <input type="hidden" name="referenceId" value={referenceId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={pendingAction !== null}
              pending={pendingAction === "reject"}
              pendingLabel="Removing…"
            >
              Reject
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
