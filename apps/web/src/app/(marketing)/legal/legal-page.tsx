import { Alert } from "@/components/ui";

// Bumped whenever any legal page's substance changes. Shown on every page
// so a reader can tell how current the text is.
export const LEGAL_LAST_UPDATED = "September 6, 2026";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Legal</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-xs text-muted">Last updated {LEGAL_LAST_UPDATED}</p>

      <Alert tone="warning" title="Draft — not final" className="mt-6">
        This page is a placeholder while Outlet AI Studio is in early access. It has not been through legal review and
        should not be relied on as a finished policy.
      </Alert>

      <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-muted [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-accent [&_a:hover]:underline">
        {children}
      </div>
    </article>
  );
}
