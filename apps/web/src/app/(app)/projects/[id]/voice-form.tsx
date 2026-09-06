"use client";

import { useActionState, useState } from "react";
import { Alert, Button, useActionToast } from "@/components/ui";
import { requestVoice } from "./actions";

const initialState = { error: "" };

export function GenerateVoiceForm({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestVoice, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Voice generation requested — confirm the cost estimate to start.");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button
        type="submit"
        pending={pending}
        pendingLabel="Estimating cost…"
        disabled={Boolean(disabledReason)}
        className="w-fit"
      >
        Generate voice
      </Button>
    </form>
  );
}
