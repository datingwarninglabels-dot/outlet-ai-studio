const TRUST_POINTS = [
  {
    title: "Private by default",
    body: "Projects and generated media are stored in private storage and served only through short-lived signed links — never left at a public or temporary URL.",
  },
  {
    title: "You review before anything renders",
    body: "See an estimated cost before a generation runs, and confirm it before it starts. Nothing generates automatically.",
  },
  {
    title: "You review before export, too",
    body: "Scenes, visuals, and voice are all editable before the final video assembles — approval happens on your terms, not automatically.",
  },
  {
    title: "Real people require documented permission",
    body: "A character based on a real person can't be saved without recorded permission notes — enforced, not just suggested.",
  },
  {
    title: "Consent-first, always",
    body: "Any future voice-cloning or identity-based feature will require explicit, documented consent before it can be used — no exceptions.",
  },
  {
    title: "Secure billing when it launches",
    body: "Billing will run through our payment provider's own secure Checkout. Outlet AI Studio will never see or store your full card details.",
  },
];

export function Trust() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Trust &amp; control</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Your projects, your calls, at every step.
        </h2>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_POINTS.map((point) => (
          <div key={point.title} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">{point.title}</h3>
            <p className="text-sm text-muted">{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
