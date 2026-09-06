"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Textarea, useActionToast } from "@/components/ui";

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

function TextField({
  label,
  name,
  defaultValue,
  required,
  optional,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <Field id={name} label={label} optional={optional}>
      <Input name={name} defaultValue={defaultValue ?? ""} required={required} maxLength={300} />
    </Field>
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
  useActionToast(state, pending, "World saved.");
  const assignedSet = new Set(assignedCharacterIds);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {worldId && <input type="hidden" name="worldId" value={worldId} />}

      <TextField label="Name" name="name" defaultValue={defaults?.name} required />
      <Field id="description" label="Description">
        <Textarea name="description" defaultValue={defaults?.description ?? ""} required rows={2} maxLength={1000} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Location" name="locationDescription" defaultValue={defaults?.locationDescription} />
        <TextField label="Props / vehicles" name="propsVehicles" defaultValue={defaults?.propsVehicles} />
        <TextField
          label="Typical outfits / accessories"
          name="outfitsAccessories"
          defaultValue={defaults?.outfitsAccessories}
        />
        <TextField label="Lighting / color palette" name="lightingPalette" defaultValue={defaults?.lightingPalette} />
        <TextField label="Camera / lens style" name="cameraStyle" defaultValue={defaults?.cameraStyle} />
        <TextField label="Animation / realism style" name="animationStyle" defaultValue={defaults?.animationStyle} />
        <TextField label="Time of day" name="timeOfDay" defaultValue={defaults?.timeOfDay} />
        <TextField label="Weather" name="weather" defaultValue={defaults?.weather} />
      </div>

      <TextField label="Negative prompt" name="negativePrompt" defaultValue={defaults?.negativePrompt} optional />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Characters who typically appear in this world</p>
        {ownedCharacters.length === 0 ? (
          <p className="text-xs text-muted">No characters yet — create one in Characters first.</p>
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

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Button type="submit" pending={pending} pendingLabel="Saving…" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
