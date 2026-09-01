type Feature = { title: string; body: string; status?: "planned" };

const FEATURES: Feature[] = [
  {
    title: "Script modes for how you like to work",
    body: "Quick mode makes the creative calls for you; guided and studio modes hand you more control over the draft.",
  },
  {
    title: "AI scenes, shot by shot",
    body: "Every scene gets its own generated visual, matched to the narration and pacing you approved.",
  },
  {
    title: "Natural voiceover",
    body: "Turn your full script into narration in one pass, ready to sit under the finished video.",
  },
  {
    title: "Captions, generated for free",
    body: "Every export includes SRT and VTT captions timed to your scene list — no extra generation cost.",
  },
  {
    title: "Scene-based editing that resumes itself",
    body: "Edit narration, visuals, or timing per scene. If a render is interrupted, retrying picks up where it left off — you're never charged twice for the same scene.",
  },
  {
    title: "Thumbnails built for your platform",
    body: "Generate several style options at once, then edit the headline text for free without a new render.",
  },
  {
    title: "A media library that remembers everything",
    body: "Every generated and uploaded asset lives in one place, organized by project, with private storage by default.",
  },
  {
    title: "A brand kit that applies itself",
    body: "Set a default visual style and voice once — new projects pick them up automatically, with room to override per project.",
  },
  {
    title: "Provider flexibility, not lock-in",
    body: "Outlet AI Studio is built on adapters for every generation step, so the providers behind the scenes can change without changing how you work.",
  },
  {
    title: "A full content package on export",
    body: "One project produces a finished video, a thumbnail, captions, and a scene breakdown together — see the full breakdown below.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Feature showcase</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Everything a faceless-content workflow needs, connected.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-balance">{feature.title}</h3>
                {feature.status === "planned" && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    Planned
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
