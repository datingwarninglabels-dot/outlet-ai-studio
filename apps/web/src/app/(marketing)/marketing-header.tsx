"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { Logo } from "./logo";
import { PRIMARY_CTA_LABEL, primaryCtaHref } from "@/lib/site-config";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Characters", href: "#characters" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ctaHref = primaryCtaHref();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-muted hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href="/login" className="text-sm text-muted hover:text-foreground">
            Log in
          </a>
          <a
            href={ctaHref}
            onClick={() => track({ name: "cta_click", location: "header" })}
            className="flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-strong"
          >
            {PRIMARY_CTA_LABEL}
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border md:hidden"
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
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="flex flex-col gap-1 border-t border-border bg-background px-4 py-4 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="flex h-11 items-center rounded-lg px-2 text-sm text-muted hover:bg-surface hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="flex h-11 items-center rounded-lg px-2 text-sm text-muted hover:bg-surface hover:text-foreground"
          >
            Log in
          </a>
          <a
            href={ctaHref}
            onClick={() => {
              track({ name: "cta_click", location: "header-mobile" });
              setMenuOpen(false);
            }}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-strong"
          >
            {PRIMARY_CTA_LABEL}
          </a>
        </nav>
      )}
    </header>
  );
}
