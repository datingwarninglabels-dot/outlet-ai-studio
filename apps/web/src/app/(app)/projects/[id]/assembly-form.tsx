"use client";

import { useActionState, useState } from "react";
import { requestAssembly } from "./actions";

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

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        className="h-11 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Estimating cost..." : "Assemble final video"}
      </button>
    </form>
  );
}
