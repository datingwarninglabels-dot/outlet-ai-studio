"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./toast";

/**
 * Fires a success toast after a `useActionState` action completes without
 * an error. Errors are left to the form's inline <Alert> (they belong next
 * to the field), so this only speaks up on success — useful on the long
 * project page where the button that was clicked may have scrolled away by
 * the time the server action returns.
 */
export function useActionToast(state: { error: string }, pending: boolean, successMessage: string) {
  const { toast } = useToast();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (!state.error) toast(successMessage, "success");
  }, [pending, state, toast, successMessage]);
}
