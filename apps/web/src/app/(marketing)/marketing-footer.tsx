import { Logo } from "./logo";
import { PRIMARY_CTA_LABEL, primaryCtaHref, SOCIAL_LINKS, SUPPORT_EMAIL, currentYear } from "@/lib/site-config";

const PRODUCT_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Characters", href: "#characters" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds" },
  { label: "Acceptable Use", href: "/legal/acceptable-use" },
  { label: "Copyright / Takedown", href: "/legal/copyright" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
            <Logo className="text-sm font-semibold" />
            <p className="text-sm text-muted">Your idea. Your voice. Your outlet.</p>
            <a
              href={primaryCtaHref()}
              className="mt-1 flex h-9 w-fit items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface"
            >
              {PRIMARY_CTA_LABEL}
            </a>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Product</p>
            {PRODUCT_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-muted hover:text-foreground">
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Account</p>
            <a href="/login" className="text-sm text-muted hover:text-foreground">
              Log in
            </a>
            {SUPPORT_EMAIL && (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-muted hover:text-foreground">
                Support
              </a>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Legal</p>
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-muted hover:text-foreground">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted">© {currentYear()} Outlet AI Studio. All rights reserved.</p>
          {SOCIAL_LINKS.length > 0 && (
            <div className="flex gap-4">
              {SOCIAL_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="text-xs text-muted hover:text-foreground">
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
