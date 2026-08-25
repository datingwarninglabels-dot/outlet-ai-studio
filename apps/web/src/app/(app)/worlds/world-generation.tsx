"use client";

import { useActionState, useState } from "react";
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

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="worldId" value={worldId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error && (
        <p role="alert" className="text-xs text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        className="h-11 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Estimating cost..." : "Generate reference set (establishing + detail)"}
      </button>
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

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="worldId" value={worldId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error && (
        <p role="alert" className="text-xs text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        className="h-10 w-fit rounded-lg border border-border px-4 text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Estimating cost..." : "Run consistency test (1 cheap image)"}
      </button>
    </form>
  );
}
