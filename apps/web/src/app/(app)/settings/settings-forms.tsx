"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Field, Input, useActionToast } from "@/components/ui";
import { changePassword, deleteAccount, updateProfile } from "./actions";

const initialState = { error: "" };

export function ProfileForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  useActionToast(state, pending, "Name updated.");

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">Profile</p>
      <form action={formAction} className="flex flex-col gap-3">
        <Field id="name" label="Display name">
          <Input name="name" required maxLength={100} defaultValue={name} autoComplete="name" />
        </Field>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Saving…" className="w-fit">
          Save
        </Button>
      </form>
    </Card>
  );
}

export function PasswordForm({ canChangePassword }: { canChangePassword: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  useActionToast(state, pending, "Password changed.");

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">Password</p>
      {canChangePassword ? (
        <form action={formAction} className="flex flex-col gap-3">
          <Field id="currentPassword" label="Current password">
            <Input name="currentPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field id="newPassword" label="New password" hint="At least 12 characters.">
            <Input name="newPassword" type="password" required minLength={12} autoComplete="new-password" />
          </Field>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Saving…" className="w-fit">
            Change password
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">You sign in with Google, so there&apos;s no password to change here.</p>
      )}
    </Card>
  );
}

export function DeleteAccountForm({ isOwner }: { isOwner: boolean }) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);

  return (
    <Card tone="danger" className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-danger">Delete account</p>
      {isOwner ? (
        <p className="text-sm text-muted">
          The Owner account can&apos;t be deleted here — it&apos;s the platform operator account.
        </p>
      ) : (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm text-muted">
            Permanently delete this account and all its projects, media, characters, and worlds.
          </summary>
          <form action={formAction} className="mt-3 flex flex-col gap-3">
            <Field id="confirmEmail" label="Type your account email to confirm">
              <Input name="confirmEmail" type="email" required autoComplete="off" />
            </Field>
            {state.error && <Alert tone="danger">{state.error}</Alert>}
            <Button type="submit" variant="danger" size="sm" pending={pending} pendingLabel="Deleting…" className="w-fit">
              Delete my account
            </Button>
          </form>
        </details>
      )}
    </Card>
  );
}
