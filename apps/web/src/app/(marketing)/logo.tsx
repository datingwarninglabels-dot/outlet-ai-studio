import Link from "next/link";

/**
 * Text wordmark — the temporary launch/development logo, not the final
 * registered brand mark. Isolated as its own component so a real logo
 * (image or SVG) can replace the contents here without touching every
 * place the brand appears.
 */
export function Logo({ className = "text-base font-semibold tracking-tight" }: { className?: string }) {
  return (
    <Link href="/" className={className}>
      Outlet AI Studio
    </Link>
  );
}
