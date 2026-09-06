"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { status: "idle", message: "" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.message}</Alert>
        <Button href="/login" fullWidth>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" hint="At least 12 characters.">
        <Input name="password" type="password" required minLength={12} autoComplete="new-password" />
      </Field>
      {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" pending={pending} pendingLabel="Saving…" fullWidth>
        Set new password
      </Button>
    </form>
  );
}
