const FORMATS = [
  { name: "TikTok", ratio: "9:16" },
  { name: "YouTube Shorts", ratio: "9:16" },
  { name: "YouTube", ratio: "16:9" },
  { name: "Facebook Reels", ratio: "9:16" },
  { name: "Instagram Reels", ratio: "9:16" },
  { name: "Thumbnails & covers", ratio: "platform-sized" },
];

export function OutputFormats() {
  return (
    <section className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Output formats</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built for where you actually publish.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FORMATS.map((format) => (
            <div key={format.name} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-4 text-center">
              <span
                aria-hidden="true"
                className={`rounded-md border border-border bg-surface-raised ${format.ratio === "9:16" ? "h-10 w-6" : format.ratio === "16:9" ? "h-6 w-10" : "h-8 w-9"}`}
              />
              <p className="text-xs font-medium">{format.name}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
          Outlet AI Studio renders and packages your content correctly sized for each format above.
          Direct publishing and scheduling to these platforms is <strong className="text-foreground">planned</strong>,
          not available yet — every export downloads as a package you post yourself.
        </p>
      </div>
    </section>
  );
}
