"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui";
import type { NavItem } from "@/lib/nav";

export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-raised font-medium text-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        {active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />}
        {item.label}
      </span>
      {item.status === "planned" && <Badge>Soon</Badge>}
    </Link>
  );
}
