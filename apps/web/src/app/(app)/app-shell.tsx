"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  navItems,
  userEmail,
  children,
}: {
  navItems: NavItem[];
  userEmail: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  // Closing the menu on navigation is a state adjustment in response to a
  // prop change, not a side effect — done during render (React's own
  // recommended pattern for this), not in a useEffect, which would trigger
  // an extra unnecessary render and this project's set-state-in-effect lint
  // rule (see waitlist-form.tsx's note on the same pitfall).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* Mobile-only top bar — the sidebar below is off-canvas until toggled. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <p className="text-sm font-semibold tracking-tight">Outlet AI Studio</p>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="app-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"
        >
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-5 bg-foreground transition-transform ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span className={`absolute left-0 top-[7px] h-0.5 w-5 bg-foreground transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span
              className={`absolute left-0 top-[14px] h-0.5 w-5 bg-foreground transition-transform ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </header>

      {/* Backdrop — dismisses the off-canvas nav on click-outside, mobile only. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      )}

      <aside
        id="app-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col gap-6 border-r border-border bg-surface p-4 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          menuOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="hidden md:block">
          <p className="text-sm font-semibold tracking-tight">Outlet AI Studio</p>
          <p className="text-xs text-muted">Your idea. Your voice. Your outlet.</p>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="truncate text-xs text-muted">{userEmail}</p>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
