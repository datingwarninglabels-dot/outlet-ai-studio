const SEPARATE_TOOLS = ["Script tool", "Image generator", "Voice generator", "Editor", "Thumbnail app", "Publishing tool"];

export function UnifiedStudio() {
  return (
    <section className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">The problem</p>
            <h2 className="text-3xl font-bold tracking-tight text-balance">
              Right now, one video means six different tools.
            </h2>
            <p className="text-muted">
              A script tool. An image generator. A separate voice generator. An editor to stitch it
              together. A thumbnail app. And somewhere in there, keeping a character&apos;s face and
              voice consistent from scene to scene — usually by hand.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
              The Outlet AI Studio approach
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-balance">
              One workspace. You stay in control at every step.
            </h2>
            <p className="text-muted">
              Outlet AI Studio connects script, characters, worlds, scenes, voice, and export into a
              single project — with a cost estimate before anything generates and a review step
              before anything ships. Nothing renders without your confirmation.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 opacity-70 sm:mt-16" aria-hidden="true">
          {SEPARATE_TOOLS.map((tool, i) => (
            <span key={tool} className="flex items-center gap-3">
              <span className="rounded-full border border-dashed border-border px-4 py-2 text-xs text-muted line-through">
                {tool}
              </span>
              {i < SEPARATE_TOOLS.length - 1 && <span className="text-border">+</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-muted">becomes one connected workflow.</p>
      </div>
    </section>
  );
}
