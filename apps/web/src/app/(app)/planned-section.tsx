export function PlannedSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <span className="w-fit rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
        Not built yet
      </span>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
