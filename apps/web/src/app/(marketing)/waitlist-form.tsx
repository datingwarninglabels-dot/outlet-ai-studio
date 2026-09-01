"use client";

import { useActionState, useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { CREATOR_TYPES } from "@/lib/validation";
import { joinWaitlist, type WaitlistState } from "./actions";

const initialState: WaitlistState = { status: "idle", message: "" };

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState(joinWaitlist, initialState);
  // Uncontrolled + set via ref in an effect (client-only, after hydration)
  // rather than React state seeded from a useState(() => Date.now())
  // initializer — that initializer also runs during SSR, so its Date.now()
  // would differ from the client's on hydration and mismatch the value
  // embedded in the hidden input's rendered HTML.
  const renderedAtInputRef = useRef<HTMLInputElement>(null);
  const trackedStatus = useRef<WaitlistState["status"] | null>(null);

  useEffect(() => {
    if (renderedAtInputRef.current) {
      renderedAtInputRef.current.value = String(Date.now());
    }
  }, []);

  useEffect(() => {
    if (state.status === trackedStatus.current) return;
    trackedStatus.current = state.status;
    if (state.status === "success") {
      track({ name: "waitlist_success" });
    } else if (state.status === "error") {
      track({ name: "waitlist_error" });
    }
  }, [state.status]);

  if (state.status === "success") {
    return (
      <div role="status" className="rounded-lg border border-accent/40 bg-accent-soft p-5 text-sm">
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="renderedAt" ref={renderedAtInputRef} defaultValue="" />
      {/* Honeypot — hidden from real visitors via CSS (not type="hidden",
          which some bots skip). Zero-size and overflow-hidden rather than
          off-screen positioning, so it can never contribute to page-level
          horizontal scroll regardless of ancestor positioning context. */}
      <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="creatorType" className="text-sm text-muted">
            What kind of creator are you? (optional)
          </label>
          <select
            id="creatorType"
            name="creatorType"
            defaultValue=""
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-accent"
          >
            <option value="">Prefer not to say</option>
            {CREATOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>
          I agree to be contacted about Outlet AI Studio and to the{" "}
          <a href="/legal/privacy" className="text-accent hover:underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-fit rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Joining..." : "Join the Waitlist"}
      </button>
    </form>
  );
}
