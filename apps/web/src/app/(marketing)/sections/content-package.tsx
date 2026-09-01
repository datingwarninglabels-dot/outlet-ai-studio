const INCLUDED = [
  { label: "Final video", note: "assembled from your scenes, voice, and captions" },
  { label: "Thumbnail", note: "in your chosen style, with editable headline text" },
  { label: "Captions", note: "SRT and VTT, timed to your scene list" },
  { label: "Script & scene breakdown", note: "the full narration and shot list behind the video" },
];

const PLANNED = ["Title ideas", "Description copy", "Hashtag suggestions", "Platform-specific captions"];

export function ContentPackage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            One project, everything you need to post
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Download a complete package, not just a video file.
          </h2>
          <p className="text-muted">
            You review and approve every generated piece before export — nothing ships without your
            say-so.
          </p>
          <div className="mt-2 rounded-xl border border-dashed border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Planned additions</p>
            <p className="mt-2 text-sm text-muted">
              {PLANNED.join(" · ")} — not generated yet, on the roadmap.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {INCLUDED.map((item) => (
            <div key={item.label} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs text-accent"
              >
                ✓
              </span>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-sm text-muted">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
