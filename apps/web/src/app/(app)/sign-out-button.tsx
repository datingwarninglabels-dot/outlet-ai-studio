"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui";

export function SignOutButton() {
  return (
    <Button type="button" variant="secondary" size="sm" fullWidth onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </Button>
  );
}
