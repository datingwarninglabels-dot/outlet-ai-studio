"use client";

import { useActionState, useState } from "react";
import { approveReference, rejectReference, uploadReference } from "./actions";

const initialState = { error: "" };

export function UploadReferenceForm({ worldId }: { worldId: string }) {
  const [state, formAction, pending] = useActionState(uploadReference, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="worldId" value={worldId} />
      <input
        type="file"
        name="file"
        accept="image/*"
        required
        className="text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-sm"
      />
      {state.error && (
        <p role="alert" className="text-xs text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit rounded-lg border border-border px-4 text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload reference image"}
      </button>
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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset */}
      <img src={imageUrl} alt={viewType} className="w-full rounded" />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {viewType} · {source}
        </p>
        {approved && <span className="text-[10px] uppercase text-accent-teal">Approved</span>}
      </div>
      {!approved && (
        <div className="flex gap-2">
          <form action={approveReference} onSubmit={() => setPendingAction("approve")}>
            <input type="hidden" name="referenceId" value={referenceId} />
            <button
              type="submit"
              disabled={pendingAction !== null}
              className="h-8 rounded-lg border border-accent-teal/40 px-3 text-xs text-accent-teal hover:bg-surface-raised disabled:opacity-60"
            >
              {pendingAction === "approve" ? "Approving..." : "Approve"}
            </button>
          </form>
          <form action={rejectReference} onSubmit={() => setPendingAction("reject")}>
            <input type="hidden" name="referenceId" value={referenceId} />
            <button
              type="submit"
              disabled={pendingAction !== null}
              className="h-8 rounded-lg border border-border px-3 text-xs text-muted hover:bg-surface-raised disabled:opacity-60"
            >
              {pendingAction === "reject" ? "Removing..." : "Reject"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
