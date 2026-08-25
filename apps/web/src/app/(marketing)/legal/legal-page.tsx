export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Legal</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
      <div className="mt-4 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
        <strong className="text-foreground">Draft — not final.</strong> This page is a placeholder
        while Outlet AI Studio is in early access. It has not been through legal review and should
        not be relied on as a finished policy.
      </div>
      <div className="prose-sm mt-8 flex flex-col gap-4 text-sm leading-relaxed text-muted [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
        {children}
      </div>
    </article>
  );
}
