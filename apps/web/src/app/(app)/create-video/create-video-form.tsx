"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { PAYWALL_MESSAGE } from "@/lib/paywall-message";
import { PLATFORMS } from "@/lib/validation";
import { requestScript } from "./actions";
import { Paywall } from "../paywall";

const MODES = [
  { value: "quick", label: "Quick", description: "AI makes sensible choices — you review the finished script." },
  { value: "guided", label: "Guided", description: "You approve the script before storyboard, voice, or visuals run." },
  { value: "studio", label: "Studio", description: "Full manual control over every scene and setting." },
] as const;

const initialState = { error: "" };

export function CreateVideoForm({
  scriptProviderConfigured,
  defaultPlatform,
}: {
  scriptProviderConfigured: boolean;
  defaultPlatform: (typeof PLATFORMS)[number];
}) {
  const [state, formAction, pending] = useActionState(requestScript, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const paywalled = state.error === PAYWALL_MESSAGE;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {!scriptProviderConfigured && (
        <Alert tone="warning" title="Script generation isn't connected yet">
          Add <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to your environment and restart the app to
          enable this form.
        </Alert>
      )}

      <Alert tone="info">
        This creates the project and shows an estimated cost before anything is generated — nothing is charged until
        you confirm on the next screen.
      </Alert>

      <Field
        id="idea"
        label="What do you want to create?"
        hint="Describe the video in a sentence or two — topic, length, and tone."
      >
        <Textarea
          name="idea"
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          placeholder="A 45-second video about dating warning signs, with a warm and direct tone."
        />
      </Field>

      <Field id="platform" label="Platform">
        <Select name="platform" defaultValue={defaultPlatform}>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Mode</legend>
        {MODES.map((mode) => (
          <label
            key={mode.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input type="radio" name="mode" value={mode.value} defaultChecked={mode.value === "quick"} className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">{mode.label}</span>
              <span className="block text-muted">{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {paywalled ? (
        <Paywall compact />
      ) : (
        state.error && <Alert tone="danger">{state.error}</Alert>
      )}

      <Button type="submit" pending={pending} pendingLabel="Setting up…" disabled={!scriptProviderConfigured}>
        Continue
      </Button>
    </form>
  );
}
