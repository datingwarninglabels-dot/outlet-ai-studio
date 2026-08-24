"use client";

import { useActionState } from "react";
import { generateStoryboard, updateScene } from "./actions";

const initialState = { error: "" };

export function GenerateStoryboardForm({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(generateStoryboard, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
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
        {pending ? "Building storyboard..." : "Generate storyboard"}
      </button>
    </form>
  );
}

export function SceneEditForm({
  projectId,
  scene,
}: {
  projectId: string;
  scene: {
    id: string;
    narration: string;
    visualDescription: string;
    durationSeconds: number | null;
    provider: string | null;
    model: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateScene, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="sceneId" value={scene.id} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="narration" className="text-sm font-medium">
          Narration
        </label>
        <textarea
          id="narration"
          name="narration"
          required
          minLength={1}
          maxLength={4000}
          rows={4}
          defaultValue={scene.narration}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="visualDescription" className="text-sm font-medium">
          Visual description
        </label>
        <textarea
          id="visualDescription"
          name="visualDescription"
          required
          minLength={1}
          maxLength={2000}
          rows={3}
          defaultValue={scene.visualDescription}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="durationSeconds" className="text-sm font-medium">
          Duration (seconds)
        </label>
        <input
          id="durationSeconds"
          name="durationSeconds"
          type="number"
          required
          min={1}
          max={3600}
          defaultValue={scene.durationSeconds ?? 30}
          className="h-11 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {scene.provider ?? "unknown"}/{scene.model ?? "unknown"}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
