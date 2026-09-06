"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle", message: "" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="email" label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" pending={pending} pendingLabel="Sending…" fullWidth>
        Send reset link
      </Button>
    </form>
  );
}
