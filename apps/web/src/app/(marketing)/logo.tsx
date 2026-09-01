import Image from "next/image";
import Link from "next/link";

/**
 * Icon + text wordmark — the wordmark stays live text (styled with the
 * theme's foreground token) rather than baked into the source image: the
 * supplied artwork's flattened wordmark renders in dark brown, which is
 * unreadable against this page's dark background. The icon mark itself
 * (copper/gold, cropped from the supplied artwork) reads clearly there.
 * Isolated as its own component so the icon or text styling can be
 * swapped without touching every place the brand appears.
 */
export function Logo({ className = "text-base font-semibold tracking-tight" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <Image src="/logo-icon.png" alt="" width={34} height={28} priority className="h-7 w-auto" />
      <span>Outlet AI Studio</span>
    </Link>
  );
}
