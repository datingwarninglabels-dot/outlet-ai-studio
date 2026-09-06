"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { EXAMPLE_IDEAS } from "@/lib/create-examples";
import { PAYWALL_MESSAGE } from "@/lib/paywall-message";
import { PLATFORMS } from "@/lib/validation";
import { requestScript } from "./actions";
import { Paywall } from "../paywall";

const MODES = [
  { value: "quick", label: "Quick", description: "AI makes sensible choices — you review the finished script." },
  { value: "guided", label: "Guided", description: "You approve the script before storyboard, voice, or visuals run." },
  { value: "studio", label: "Studio", description: "Full manual control over every scene and setting." },
] as const;

const NEXT_STEPS = [
  "Review the generated script and edit it if you want",
  "Break it into a scene-by-scene storyboard",
  "Add voiceover, then per-scene visuals and animation",
  "Assemble the final video and export the package",
];

const initialState = { error: "" };

export function CreateVideoForm({
  scriptProviderConfigured,
  defaultPlatform,
  defaultIdea = "",
}: {
  scriptProviderConfigured: boolean;
  defaultPlatform: (typeof PLATFORMS)[number];
  defaultIdea?: string;
}) {
  const [state, formAction, pending] = useActionState(requestScript, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const ideaRef = useRef<HTMLTextAreaElement>(null);
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

      <div className="flex flex-col gap-2">
        <Field
          id="idea"
          label="What do you want to create?"
          hint="Describe the video in a sentence or two — topic, length, and tone."
        >
          <Textarea
            ref={ideaRef}
            name="idea"
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            defaultValue={defaultIdea}
            placeholder="A 45-second video about dating warning signs, with a warm and direct tone."
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_IDEAS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                if (ideaRef.current) {
                  ideaRef.current.value = example;
                  ideaRef.current.focus();
                }
              }}
              className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              {example.length > 52 ? `${example.slice(0, 52)}…` : example}
            </button>
          ))}
        </div>
      </div>

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

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">After this</p>
        <ol className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="text-muted">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </form>
  );
}
