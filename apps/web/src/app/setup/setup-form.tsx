"use client";

import { useActionState } from "react";
import { createOwner } from "./actions";

const initialState = { error: "" };

export function SetupForm() {
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await createOwner(formData);
    return result ?? initialState;
  }, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm text-muted">
          Your name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm text-muted">
          Password (12+ characters)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal font-medium text-black disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create Owner account"}
      </button>
    </form>
  );
}
