"use client";

import { useActionState, useState } from "react";
import { Button, useActionToast } from "@/components/ui";
import { requestAssembly } from "./actions";
import { GenerateError } from "./generate-error";

const initialState = { error: "" };

export function GenerateAssemblyForm({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestAssembly, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useActionToast(state, pending, "Assembly requested — confirm the cost estimate to start the render.");

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
        Assemble final video
      </Button>
    </form>
  );
}
