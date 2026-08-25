"use client";

import { useActionState } from "react";

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
        maxLength={name === "permissionNotes" ? 1000 : name === "description" ? 1000 : 500}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
      />
    </div>
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {characterId && <input type="hidden" name="characterId" value={characterId} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={defaults?.name} required />
        <Field
          label="Assigned voice ID (ElevenLabs, optional)"
          name="assignedVoiceId"
          defaultValue={defaults?.assignedVoiceId}
        />
      </div>

      <TextArea label="Description" name="description" defaultValue={defaults?.description} required rows={2} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Face" name="face" defaultValue={defaults?.face} />
        <Field label="Skin tone" name="skinTone" defaultValue={defaults?.skinTone} />
        <Field label="Hair" name="hair" defaultValue={defaults?.hair} />
        <Field label="Body type" name="bodyType" defaultValue={defaults?.bodyType} />
        <Field label="Apparent age" name="apparentAge" defaultValue={defaults?.apparentAge} />
        <Field label="Color palette" name="palette" defaultValue={defaults?.palette} />
      </div>

      <Field
        label="Distinguishing details"
        name="distinguishingDetails"
        defaultValue={defaults?.distinguishingDetails}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Default clothing" name="defaultClothing" defaultValue={defaults?.defaultClothing} />
        <Field label="Accessories" name="accessories" defaultValue={defaults?.accessories} />
      </div>

      <Field label="Negative prompt (optional)" name="negativePrompt" defaultValue={defaults?.negativePrompt} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRealPerson" defaultChecked={defaults?.isRealPerson} />
        This character is based on a real person
      </label>
      <TextArea
        label="Permission notes — required if based on a real person"
        name="permissionNotes"
        defaultValue={defaults?.permissionNotes}
        rows={2}
      />

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
