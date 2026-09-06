const STEPS = [
  { title: "Start with an idea", body: "Type the idea, pick your platform and mode — quick, guided, or full studio control." },
  { title: "Write or research the script", body: "Generate a script, then edit it directly before anything else builds on it." },
  { title: "Build characters and worlds", body: "Lock a character's appearance and voice, or a world's look and lighting, once — reuse them across projects." },
  { title: "Generate scenes and voices", body: "Each scene gets its own visual and narration, with a continuity check against your locked details." },
  { title: "Review, edit, and render", body: "Approve, retry, or adjust any scene before the final video assembles." },
  { title: "Export the full content package", body: "Download the finished video, thumbnail, captions, and scene breakdown together." },
];

export function Workflow() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">How it works</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          From idea to finished package, one connected pass.
        </h2>
        <p className="mt-4 text-muted">
          Every step is reviewable. Nothing renders automatically, and nothing is final until you say
          so.
        </p>
      </div>

      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
            <span className="text-xs font-mono text-accent">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-base font-semibold">{step.title}</h3>
            <p className="text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
