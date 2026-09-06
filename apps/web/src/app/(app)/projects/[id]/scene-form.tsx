"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea, useActionToast } from "@/components/ui";
import { moveScene, requestStoryboard, updateScene } from "./actions";
import { GenerateError } from "./generate-error";

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
  useActionToast(state, pending, "Storyboard requested — confirm the cost estimate to start.");

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
        Generate storyboard
      </Button>
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
  ownedCharacters,
  ownedWorlds,
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
    characterId: string | null;
    worldId: string | null;
  };
  index: number;
  sceneCount: number;
  updateAction: typeof updateScene;
  moveAction: typeof moveScene;
  ownedCharacters: { id: string; name: string }[];
  ownedWorlds: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateAction, initialState);
  const [moveState, moveFormAction, moving] = useActionState(moveAction, initialState);
  useActionToast(state, pending, `Scene ${index + 1} saved.`);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Scene {index + 1}</p>
        <div className="flex gap-1">
          <form action={moveFormAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="sceneId" value={scene.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={moving || index === 0}
              aria-label={`Move scene ${index + 1} up`}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
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
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↓
            </button>
          </form>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="sceneId" value={scene.id} />

        <Field id={`narration-${scene.id}`} label="Narration">
          <Textarea name="narration" required minLength={1} maxLength={4000} rows={3} defaultValue={scene.narration} />
        </Field>

        <Field id={`visualDescription-${scene.id}`} label="Visual description">
          <Textarea
            name="visualDescription"
            required
            minLength={1}
            maxLength={2000}
            rows={2}
            defaultValue={scene.visualDescription}
          />
        </Field>

        <Field id={`audioDirection-${scene.id}`} label="Audio direction" optional>
          <Input name="audioDirection" maxLength={500} defaultValue={scene.audioDirection} placeholder="none" />
        </Field>

        <Field id={`durationSeconds-${scene.id}`} label="Duration (seconds)">
          <Input
            name="durationSeconds"
            type="number"
            required
            min={1}
            max={3600}
            defaultValue={scene.durationSeconds ?? 30}
            className="w-32"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id={`characterId-${scene.id}`} label="Character" optional>
            <Select name="characterId" defaultValue={scene.characterId ?? ""}>
              <option value="">None</option>
              {ownedCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`worldId-${scene.id}`} label="World" optional>
            <Select name="worldId" defaultValue={scene.worldId ?? ""}>
              <option value="">None</option>
              {ownedWorlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {(scene.characterId || scene.worldId) && (
          <p className="text-xs text-muted">
            Visual generation will try to match this assignment&apos;s locked appearance/setting details and run a
            continuity check after generating.
          </p>
        )}

        {(state.error || moveState.error) && <Alert tone="danger">{state.error || moveState.error}</Alert>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {scene.provider ?? "unknown"}/{scene.model ?? "unknown"} · v{scene.version}
          </p>
          <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Saving…">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
