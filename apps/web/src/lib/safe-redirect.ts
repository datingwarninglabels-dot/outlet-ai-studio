// Shared by auth.config.ts (building the callbackUrl when redirecting an
// unauthenticated request to /login) and /login itself (reading it back
// after a successful sign-in). Centralized so both sides agree on what
// counts as "safe" — an unvalidated callbackUrl is a classic open-redirect
// vector (e.g. "https://evil.example" or "//evil.example").
const DISALLOWED_TARGETS = new Set(["/login", "/setup", "/register"]);

export function sanitizeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) {
    return "/dashboard";
  }
  // Must be a same-origin relative path: starts with exactly one "/", never
  // "//" (protocol-relative) or an absolute URL with a scheme.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return "/dashboard";
  }
  const path = raw.split("?")[0].split("#")[0];
  if (DISALLOWED_TARGETS.has(path)) {
    return "/dashboard";
  }
  return raw;
}
