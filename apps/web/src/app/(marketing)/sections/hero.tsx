import { PRIMARY_CTA_LABEL, SECONDARY_CTA_LABEL, primaryCtaHref } from "@/lib/site-config";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pt-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            One studio. Every part of the story.
          </p>
          <h1 className="text-[2.5rem] font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
            Turn one idea into content people want to watch.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            Write the script, build consistent characters, create cinematic scenes, add natural
            voices, and export platform-ready videos and thumbnails—all in one creative workspace.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={primaryCtaHref()}
              className="flex h-12 items-center rounded-lg bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent-strong"
            >
              {PRIMARY_CTA_LABEL}
            </a>
            <a
              href="#how-it-works"
              className="flex h-12 items-center rounded-lg border border-border px-6 text-sm font-medium hover:bg-surface"
            >
              {SECONDARY_CTA_LABEL}
            </a>
          </div>
          <p className="pt-1 text-sm text-muted">
            Built for creators who want one connected workflow.
          </p>
        </div>

        <HeroComposition />
      </div>
    </section>
  );
}

/**
 * An original, abstract composition of the actual workflow — not a
 * screenshot of the app or any other product. Deliberately schematic
 * (gradient blocks + labels standing in for a script panel, a vertical
 * scene frame, and a landscape export frame) so it reads honestly as an
 * illustration of the idea, not a claim about the exact interface.
 */
function HeroComposition() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-8 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-2 text-xs text-muted">Scene 1 of 6</span>
        </div>

        <div className="grid grid-cols-[1fr_1.4fr] gap-4">
          <div className="flex aspect-[9/16] flex-col justify-between rounded-xl bg-gradient-to-b from-accent/30 via-surface-raised to-surface-raised p-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-foreground/70">
              Vertical
            </span>
            <div className="h-2 w-2/3 rounded-full bg-foreground/30" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Script</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="h-1.5 w-full rounded-full bg-border" />
                <div className="h-1.5 w-4/5 rounded-full bg-border" />
                <div className="h-1.5 w-3/5 rounded-full bg-border" />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Voice</p>
              <div className="mt-2 flex items-end gap-0.5">
                {[6, 10, 5, 14, 8, 12, 6, 9].map((h, i) => (
                  <span key={i} className="w-1 rounded-full bg-accent/70" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex aspect-video flex-col justify-between rounded-xl bg-gradient-to-br from-surface-raised to-accent/20 p-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-foreground/70">
            Landscape export
          </span>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
              ▶
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
