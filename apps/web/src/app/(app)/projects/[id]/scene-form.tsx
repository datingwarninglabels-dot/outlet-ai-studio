"use client";

import { useActionState, useState } from "react";
import { moveScene, requestStoryboard, updateScene } from "./actions";

const initialState = { error: "" };

export function GenerateStoryboardForm({
  projectId,
  disabledReason,
  requestAction,
}: {
  projectId: string;
  disabledReason: string | null;
  requestAction: typeof requestStoryboard;
}) {
  const [state, formAction, pending] = useActionState(requestAction, initialState);
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
        {pending ? "Estimating cost..." : "Generate storyboard"}
      </button>
    </form>
  );
}

export function SceneEditForm({
  projectId,
  scene,
  index,
  sceneCount,
  updateAction,
  moveAction,
}: {
  projectId: string;
  scene: {
    id: string;
    narration: string;
    visualDescription: string;
    audioDirection: string;
    durationSeconds: number | null;
    provider: string | null;
    model: string | null;
    version: number;
  };
  index: number;
  sceneCount: number;
  updateAction: typeof updateScene;
  moveAction: typeof moveScene;
}) {
  const [state, formAction, pending] = useActionState(updateAction, initialState);
  const [moveState, moveFormAction, moving] = useActionState(moveAction, initialState);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Scene {index + 1}</p>
        <div className="flex gap-1">
          <form action={moveFormAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="sceneId" value={scene.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={moving || index === 0}
              aria-label={`Move scene ${index + 1} up`}
              className="h-9 w-9 rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↑
            </button>
          </form>
          <form action={moveFormAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="sceneId" value={scene.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={moving || index === sceneCount - 1}
              aria-label={`Move scene ${index + 1} down`}
              className="h-9 w-9 rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↓
            </button>
          </form>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="sceneId" value={scene.id} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`narration-${scene.id}`} className="text-sm font-medium">
            Narration
          </label>
          <textarea
            id={`narration-${scene.id}`}
            name="narration"
            required
            minLength={1}
            maxLength={4000}
            rows={3}
            defaultValue={scene.narration}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`visualDescription-${scene.id}`} className="text-sm font-medium">
            Visual description
          </label>
          <textarea
            id={`visualDescription-${scene.id}`}
            name="visualDescription"
            required
            minLength={1}
            maxLength={2000}
            rows={2}
            defaultValue={scene.visualDescription}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`audioDirection-${scene.id}`} className="text-sm font-medium">
            Audio direction
          </label>
          <input
            id={`audioDirection-${scene.id}`}
            name="audioDirection"
            maxLength={500}
            defaultValue={scene.audioDirection}
            placeholder="none"
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`durationSeconds-${scene.id}`} className="text-sm font-medium">
            Duration (seconds)
          </label>
          <input
            id={`durationSeconds-${scene.id}`}
            name="durationSeconds"
            type="number"
            required
            min={1}
            max={3600}
            defaultValue={scene.durationSeconds ?? 30}
            className="h-11 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          />
        </div>

        {(state.error || moveState.error) && (
          <p role="alert" className="text-sm text-red-400">
            {state.error || moveState.error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            {scene.provider ?? "unknown"}/{scene.model ?? "unknown"} · v{scene.version}
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
    </div>
  );
}
