"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Textarea, useActionToast } from "@/components/ui";

const initialState = { error: "" };

type ActionState = { error: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Defaults = Partial<{
  name: string;
  description: string;
  face: string;
  skinTone: string;
  hair: string;
  bodyType: string;
  apparentAge: string;
  distinguishingDetails: string;
  defaultClothing: string;
  accessories: string;
  palette: string;
  negativePrompt: string;
  assignedVoiceId: string;
  isRealPerson: boolean;
  permissionNotes: string;
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

function AreaField({
  label,
  name,
  defaultValue,
  required,
  rows = 3,
  maxLength = 500,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Field id={name} label={label}>
      <Textarea name={name} defaultValue={defaultValue ?? ""} required={required} rows={rows} maxLength={maxLength} />
    </Field>
  );
}

export function CharacterForm({
  action,
  characterId,
  defaults,
  submitLabel,
}: {
  action: Action;
  characterId?: string;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast(state, pending, "Character saved.");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {characterId && <input type="hidden" name="characterId" value={characterId} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={defaults?.name} required />
        <TextField
          label="Assigned voice ID (ElevenLabs)"
          name="assignedVoiceId"
          defaultValue={defaults?.assignedVoiceId}
          optional
        />
      </div>

      <AreaField
        label="Description"
        name="description"
        defaultValue={defaults?.description}
        required
        rows={2}
        maxLength={1000}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField label="Face" name="face" defaultValue={defaults?.face} />
        <TextField label="Skin tone" name="skinTone" defaultValue={defaults?.skinTone} />
        <TextField label="Hair" name="hair" defaultValue={defaults?.hair} />
        <TextField label="Body type" name="bodyType" defaultValue={defaults?.bodyType} />
        <TextField label="Apparent age" name="apparentAge" defaultValue={defaults?.apparentAge} />
        <TextField label="Color palette" name="palette" defaultValue={defaults?.palette} />
      </div>

      <TextField
        label="Distinguishing details"
        name="distinguishingDetails"
        defaultValue={defaults?.distinguishingDetails}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Default clothing" name="defaultClothing" defaultValue={defaults?.defaultClothing} />
        <TextField label="Accessories" name="accessories" defaultValue={defaults?.accessories} />
      </div>

      <TextField label="Negative prompt" name="negativePrompt" defaultValue={defaults?.negativePrompt} optional />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRealPerson" defaultChecked={defaults?.isRealPerson} />
        This character is based on a real person
      </label>
      <AreaField
        label="Permission notes — required if based on a real person"
        name="permissionNotes"
        defaultValue={defaults?.permissionNotes}
        rows={2}
        maxLength={1000}
      />

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Button type="submit" pending={pending} pendingLabel="Saving…" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
