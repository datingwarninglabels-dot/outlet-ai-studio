"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { createOwner } from "./actions";

const initialState = { error: "" };

export function SetupForm() {
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await createOwner(formData);
    return result ?? initialState;
  }, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Your name">
        <Input name="name" required maxLength={100} autoComplete="name" />
      </Field>
      <Field id="email" label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field id="password" label="Password" hint="At least 12 characters.">
        <Input name="password" type="password" required minLength={12} autoComplete="new-password" />
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" pending={pending} pendingLabel="Creating…" fullWidth>
        Create Owner account
      </Button>
    </form>
  );
}
