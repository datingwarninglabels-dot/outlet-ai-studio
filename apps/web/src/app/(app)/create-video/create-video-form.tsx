"use client";

import { useActionState, useState } from "react";
import { PAYWALL_MESSAGE } from "@/lib/paywall-message";
import { PLATFORMS } from "@/lib/validation";
import { requestScript } from "./actions";
import { Paywall } from "../paywall";

const MODES = [
  { value: "quick", label: "Quick", description: "AI makes sensible choices with minimal questions." },
  { value: "guided", label: "Guided", description: "You approve the script before anything else happens." },
  { value: "studio", label: "Studio", description: "Full manual control over scenes and settings." },
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

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {!scriptProviderConfigured && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          Script generation isn&apos;t connected yet — add <code>ANTHROPIC_API_KEY</code> to your
          environment and restart the app to enable this form.
        </p>
      )}

      <p className="text-xs text-muted">
        This creates the project and shows you an estimated cost before anything is generated —
        nothing is charged until you confirm on the next screen.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea" className="text-sm font-medium">
          What do you want to create?
        </label>
        <textarea
          id="idea"
          name="idea"
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          placeholder="A 45-second video about dating warning signs, with a warm and direct tone."
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-accent-teal"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="platform" className="text-sm font-medium">
          Platform
        </label>
        <select
          id="platform"
          name="platform"
          defaultValue={defaultPlatform}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
        >
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Mode</legend>
        {MODES.map((mode) => (
          <label
            key={mode.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm has-[:checked]:border-accent-teal"
          >
            <input
              type="radio"
              name="mode"
              value={mode.value}
              defaultChecked={mode.value === "quick"}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{mode.label}</span>
              <span className="block text-muted">{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error === PAYWALL_MESSAGE ? (
        <Paywall compact />
      ) : (
        state.error && (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        )
      )}

      <button
        type="submit"
        disabled={pending || !scriptProviderConfigured}
        className="h-11 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Setting up..." : "Continue"}
      </button>
    </form>
  );
}
