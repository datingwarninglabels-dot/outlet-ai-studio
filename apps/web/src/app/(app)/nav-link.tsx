"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-raised text-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <span>{item.label}</span>
      {item.status === "planned" && (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          Soon
        </span>
      )}
    </Link>
  );
}
