"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { registerCustomer } from "./actions";

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const websiteRef = useRef<HTMLInputElement>(null);
  // Ref, not state — a plain mutation in an effect, not tied to any
  // rendered value, so it needs no setState-in-effect workaround (see
  // (marketing)/waitlist-form.tsx's own note on this exact pitfall: a
  // useState(() => Date.now()) initializer runs during SSR too, so its
  // value would mismatch the client's on hydration).
  const renderedAtRef = useRef<number | null>(null);

  useEffect(() => {
    renderedAtRef.current = Date.now();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");

    const result = await registerCustomer({
      name,
      email,
      password,
      website: websiteRef.current?.value ?? "",
      renderedAt: renderedAtRef.current ?? 0,
    });

    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    const signInResult = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (signInResult?.error) {
      // Account was created but sign-in failed for some other reason —
      // send them to sign in manually rather than leave them stuck here.
      router.push("/login");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Honeypot — hidden from real visitors via CSS (not type="hidden",
          which some bots skip). Zero-size and overflow-hidden rather than
          off-screen positioning, so it can never contribute to page-level
          horizontal scroll regardless of ancestor positioning context. */}
      <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" ref={websiteRef} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm text-muted">
          Your name
        </label>
        <input
          id="name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm text-muted">
          Password (12+ characters)
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus-visible:border-accent-teal"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal font-medium text-black disabled:opacity-60"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
