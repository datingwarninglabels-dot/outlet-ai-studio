"use client";

import { useActionState, useState } from "react";
import { Button, useActionToast } from "@/components/ui";
import { requestVisual } from "./actions";
import { GenerateError } from "./generate-error";

const initialState = { error: "" };

export function GenerateVisualForm({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestVisual, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Visual generation requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      <GenerateError error={state.error} />

      <Button
        type="submit"
        pending={pending}
        pendingLabel="Estimating cost…"
        disabled={Boolean(disabledReason)}
        className="w-fit"
      >
        Generate visuals
      </Button>
    </form>
  );
}
