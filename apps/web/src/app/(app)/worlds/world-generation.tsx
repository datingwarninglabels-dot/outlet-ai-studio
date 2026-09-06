"use client";

import { useActionState, useState } from "react";
import { Alert, Button, useActionToast } from "@/components/ui";
import { requestWorldConsistencyTest, requestWorldReferenceSet } from "./actions";

const initialState = { error: "" };

export function GenerateWorldReferenceSetForm({
  worldId,
  disabledReason,
}: {
  worldId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestWorldReferenceSet, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Reference set requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="worldId" value={worldId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button
        type="submit"
        size="sm"
        pending={pending}
        pendingLabel="Estimating cost…"
        disabled={Boolean(disabledReason)}
        className="w-fit"
      >
        Generate reference set (establishing + detail)
      </Button>
    </form>
  );
}

export function RunWorldConsistencyTestForm({
  worldId,
  disabledReason,
}: {
  worldId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestWorldConsistencyTest, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Consistency test requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="worldId" value={worldId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        pending={pending}
        pendingLabel="Estimating cost…"
        disabled={Boolean(disabledReason)}
        className="w-fit"
      >
        Run consistency test (1 cheap image)
      </Button>
    </form>
  );
}
