"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="min-h-11 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-raised hover:text-foreground"
    >
      Sign out
    </button>
  );
}
