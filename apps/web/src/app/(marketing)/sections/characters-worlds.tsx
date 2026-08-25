const EXAMPLE_CHARACTERS = [
  { initial: "M", name: "Mira", detail: "Locked: silver-streaked hair, teal jacket, calm narrator voice" },
  { initial: "K", name: "Kade", detail: "Locked: weathered coat, gravelly voice, a scar over one brow" },
  { initial: "O", name: "Orin", detail: "Locked: round glasses, warm cardigan, curious tone" },
];

export function CharactersWorlds() {
  return (
    <section id="characters" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-col gap-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            Characters &amp; worlds
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            The same character. The same world. Every time.
          </h2>
          <p className="text-muted">
            The Character Library locks a character&apos;s appearance and voice once — face, hair,
            build, clothing, palette — so they generate the same way across every scene and every
            project. The World Library does the same for a recurring setting: location, lighting,
            camera style, time of day.
          </p>
          <p className="text-muted">
            Assign a character and a world to a scene, and Outlet AI Studio checks the generated
            image against those locked details afterward — flagging anything that drifted, so you can
            approve an intentional change or regenerate.
          </p>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
            <li>• Upload your own reference images, or generate a reference sheet from a description</li>
            <li>• A cheap consistency test before spending on a full reference set</li>
            <li>• Real-person characters require documented permission before they can be used</li>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {EXAMPLE_CHARACTERS.map((c) => (
              <div key={c.name} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center">
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent/60 to-accent-strong/60 text-lg font-semibold text-accent-foreground"
                >
                  {c.initial}
                </span>
                <p className="text-sm font-medium">{c.name}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Locked details, example</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
              {EXAMPLE_CHARACTERS.map((c) => (
                <li key={c.name}>
                  <span className="text-foreground">{c.name}:</span> {c.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
