"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const websiteRef = useRef<HTMLInputElement>(null);
  // Ref, not state — see register-form.tsx's note on why a useState(() =>
  // Date.now()) initializer would mismatch between server and client render.
  const renderedAtRef = useRef<number | null>(null);

  useEffect(() => {
    renderedAtRef.current = Date.now();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      website: websiteRef.current?.value ?? "",
      renderedAt: renderedAtRef.current ?? 0,
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Honeypot — hidden from real visitors via CSS, same pattern as
            /register and the waitlist form. */}
        <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" ref={websiteRef} type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Field id="email" label="Email">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="password" label="Password">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" pending={pending} pendingLabel="Signing in…" fullWidth>
          Sign in
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="secondary" fullWidth onClick={() => signIn("google", { callbackUrl })}>
        Continue with Google
      </Button>
    </div>
  );
}
