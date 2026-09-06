"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, useActionToast } from "@/components/ui";
import { updateProjectOverrides } from "./actions";

const initialState = { error: "" };

export function ProjectOverridesForm({
  projectId,
  visualStyleOverride,
  voiceIdOverride,
  brandKitDefaultVisualStyle,
  brandKitDefaultVoiceId,
}: {
  projectId: string;
  visualStyleOverride: string;
  voiceIdOverride: string;
  brandKitDefaultVisualStyle: string;
  brandKitDefaultVoiceId: string;
}) {
  const [state, formAction, pending] = useActionState(updateProjectOverrides, initialState);
  useActionToast(state, pending, "Project overrides saved.");
  const hasOverride = Boolean(visualStyleOverride || voiceIdOverride);

  return (
    <details className="rounded-xl border border-border bg-surface" open={hasOverride}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
        Brand Kit overrides for this project{hasOverride ? " · active" : ""}
      </summary>
      <form action={formAction} className="flex flex-col gap-3 border-t border-border p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            id="visualStyleOverride"
            label="Visual style"
            hint={brandKitDefaultVisualStyle ? `Brand Kit default: ${brandKitDefaultVisualStyle}` : undefined}
          >
            <Input
              name="visualStyleOverride"
              defaultValue={visualStyleOverride}
              placeholder="leave blank to use the Brand Kit default"
              maxLength={300}
            />
          </Field>
          <Field
            id="voiceIdOverride"
            label="Voice ID"
            hint={brandKitDefaultVoiceId ? `Brand Kit default: ${brandKitDefaultVoiceId}` : undefined}
          >
            <Input
              name="voiceIdOverride"
              defaultValue={voiceIdOverride}
              placeholder="leave blank to use the Brand Kit default"
              maxLength={300}
            />
          </Field>
        </div>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Saving…" className="w-fit">
          Save overrides
        </Button>
      </form>
    </details>
  );
}
