"use client";

import { useActionState } from "react";

const initialState = { error: "" };

type ActionState = { error: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Defaults = Partial<{
  name: string;
  description: string;
  locationDescription: string;
  propsVehicles: string;
  outfitsAccessories: string;
  lightingPalette: string;
  cameraStyle: string;
  animationStyle: string;
  timeOfDay: string;
  weather: string;
  negativePrompt: string;
}>;

function Field({ label, name, defaultValue, required }: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={300}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
      />
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        rows={rows}
        maxLength={name === "description" ? 1000 : 500}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
      />
    </div>
  );
}

export function WorldForm({
  action,
  worldId,
  defaults,
  submitLabel,
  ownedCharacters,
  assignedCharacterIds,
}: {
  action: Action;
  worldId?: string;
  defaults?: Defaults;
  submitLabel: string;
  ownedCharacters: { id: string; name: string }[];
  assignedCharacterIds: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const assignedSet = new Set(assignedCharacterIds);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {worldId && <input type="hidden" name="worldId" value={worldId} />}

      <Field label="Name" name="name" defaultValue={defaults?.name} required />
      <TextArea label="Description" name="description" defaultValue={defaults?.description} required rows={2} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Location" name="locationDescription" defaultValue={defaults?.locationDescription} />
        <Field label="Props / vehicles" name="propsVehicles" defaultValue={defaults?.propsVehicles} />
        <Field label="Typical outfits / accessories" name="outfitsAccessories" defaultValue={defaults?.outfitsAccessories} />
        <Field label="Lighting / color palette" name="lightingPalette" defaultValue={defaults?.lightingPalette} />
        <Field label="Camera / lens style" name="cameraStyle" defaultValue={defaults?.cameraStyle} />
        <Field label="Animation / realism style" name="animationStyle" defaultValue={defaults?.animationStyle} />
        <Field label="Time of day" name="timeOfDay" defaultValue={defaults?.timeOfDay} />
        <Field label="Weather" name="weather" defaultValue={defaults?.weather} />
      </div>

      <Field label="Negative prompt (optional)" name="negativePrompt" defaultValue={defaults?.negativePrompt} />

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">Characters who typically appear in this world</p>
        {ownedCharacters.length === 0 ? (
          <p className="text-xs text-muted">No characters yet — create one in the Character Library first.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {ownedCharacters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="characterIds" value={c.id} defaultChecked={assignedSet.has(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
