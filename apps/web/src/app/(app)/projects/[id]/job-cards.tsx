"use client";

import { useActionState } from "react";

type ActionState = { error: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const initialState: ActionState = { error: "" };

export function JobConfirmCard({
  jobId,
  estimatedCostCents,
  provider,
  model,
  label,
  confirmAction,
  cancelAction,
}: {
  jobId: string;
  estimatedCostCents: number;
  provider: string;
  model: string | null;
  label: string;
  confirmAction: Action;
  cancelAction: Action;
}) {
  const [confirmState, confirmFormAction, confirming] = useActionState(confirmAction, initialState);
  const [cancelState, cancelFormAction, cancelling] = useActionState(cancelAction, initialState);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent-teal/40 bg-surface p-4">
      <p className="text-sm">
        Estimated cost for {label}: <strong>${(estimatedCostCents / 100).toFixed(2)}</strong>{" "}
        <span className="text-muted">
          ({provider}
          {model ? `/${model}` : ""}, estimate only — not a guarantee)
        </span>
      </p>
      {(confirmState.error || cancelState.error) && (
        <p role="alert" className="text-sm text-red-400">
          {confirmState.error || cancelState.error}
        </p>
      )}
      <div className="flex gap-2">
        <form action={confirmFormAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            disabled={confirming || cancelling}
            className="h-10 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 text-sm font-medium text-black disabled:opacity-60"
          >
            {confirming ? "Generating..." : "Confirm & generate"}
          </button>
        </form>
        <form action={cancelFormAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            disabled={confirming || cancelling}
            className="h-10 rounded-lg border border-border px-4 text-sm text-muted disabled:opacity-60"
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export function StalledJobCard({
  jobId,
  label,
  retryAction,
}: {
  jobId: string;
  label: string;
  retryAction: Action;
}) {
  const [state, formAction, pending] = useActionState(retryAction, initialState);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-400/40 bg-surface p-4">
      <p className="text-sm text-red-400">
        {label} appears to have stalled — no update in a while. It hasn&apos;t been lost; retrying
        resumes this same job.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <form action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <button
          type="submit"
          disabled={pending}
          className="h-10 w-fit rounded-lg border border-border px-4 text-sm disabled:opacity-60"
        >
          {pending ? "Retrying..." : "Retry"}
        </button>
      </form>
    </div>
  );
}
