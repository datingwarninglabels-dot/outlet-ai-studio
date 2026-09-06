"use client";

import { useActionState } from "react";
import { Alert, Button, Card, useActionToast } from "@/components/ui";

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
  const error = confirmState.error || cancelState.error;
  useActionToast(confirmState, confirming, `Started ${label}.`);
  useActionToast(cancelState, cancelling, `Cancelled ${label} — no cost incurred.`);

  return (
    <Card tone="accent" className="flex flex-col gap-3 p-4">
      <p className="text-sm">
        Estimated cost for {label}: <strong>${(estimatedCostCents / 100).toFixed(2)}</strong>{" "}
        <span className="text-muted">
          ({provider}
          {model ? `/${model}` : ""}, estimate only — not a guarantee)
        </span>
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <form action={confirmFormAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" size="sm" pending={confirming} pendingLabel="Generating…" disabled={cancelling}>
            Confirm &amp; generate
          </Button>
        </form>
        <form action={cancelFormAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" size="sm" variant="secondary" pending={cancelling} disabled={confirming}>
            Cancel
          </Button>
        </form>
      </div>
    </Card>
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
  useActionToast(state, pending, `Retrying ${label.toLowerCase()}.`);

  return (
    <Card tone="danger" className="flex flex-col gap-3 p-4">
      <p className="text-sm text-danger">
        {label} appears to have stalled — no update in a while. It hasn&apos;t been lost; retrying resumes this same
        job.
      </p>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <form action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Retrying…">
          Retry
        </Button>
      </form>
    </Card>
  );
}
