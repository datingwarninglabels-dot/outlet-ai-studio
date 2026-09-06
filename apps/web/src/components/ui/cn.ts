/**
 * Minimal className joiner — filters out falsy values and joins with a
 * space. The app has no `clsx`/`tailwind-merge` dependency and doesn't
 * need one; component variants below never emit conflicting utilities for
 * the same property, so a plain join is enough.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
