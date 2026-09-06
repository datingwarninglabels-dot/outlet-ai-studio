"use client";

import { useActionState, useState } from "react";
import { Alert, Button, useActionToast } from "@/components/ui";
import { requestCharacterSheet, requestConsistencyTest } from "./actions";

const initialState = { error: "" };

export function GenerateCharacterSheetForm({
  characterId,
  disabledReason,
}: {
  characterId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestCharacterSheet, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Character sheet requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="characterId" value={characterId} />
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
        Generate character sheet (front/side/close-up/full-body)
      </Button>
    </form>
  );
}

export function RunConsistencyTestForm({
  characterId,
  disabledReason,
}: {
  characterId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestConsistencyTest, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Consistency test requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="characterId" value={characterId} />
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
