"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm font-medium">Brand Kit overrides for this project</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="visualStyleOverride" className="text-xs text-muted">
            Visual style{brandKitDefaultVisualStyle ? ` (Brand Kit default: ${brandKitDefaultVisualStyle})` : ""}
          </label>
          <input
            id="visualStyleOverride"
            name="visualStyleOverride"
            defaultValue={visualStyleOverride}
            placeholder="leave blank to use the Brand Kit default"
            maxLength={300}
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="voiceIdOverride" className="text-xs text-muted">
            Voice ID{brandKitDefaultVoiceId ? ` (Brand Kit default: ${brandKitDefaultVoiceId})` : ""}
          </label>
          <input
            id="voiceIdOverride"
            name="voiceIdOverride"
            defaultValue={voiceIdOverride}
            placeholder="leave blank to use the Brand Kit default"
            maxLength={300}
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-fit rounded-lg border border-border px-4 text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save overrides"}
      </button>
    </form>
  );
}
