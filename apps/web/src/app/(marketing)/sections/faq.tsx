const FAQS = [
  {
    q: "What can I create?",
    a: "Faceless short-form and long-form videos: a script, AI-generated scenes and animation, voiceover, captions, a thumbnail, and a downloadable content package — for TikTok, YouTube (including Shorts), Facebook Reels, and Instagram Reels.",
  },
  {
    q: "Which platforms are supported?",
    a: "TikTok, YouTube Shorts, YouTube, Facebook Reels, and Instagram Reels — your export is sized correctly for each. Direct publishing and scheduling to these platforms is planned, not available yet; you download your package and post it yourself.",
  },
  {
    q: "How do credits work?",
    a: "Generation uses credits, and different generation types — a script, a scene image, a voice track, a full video render — use different amounts. You'll always see an estimated cost before confirming a generation. Exact credit allowances per plan are still being finalized.",
  },
  {
    q: "Can I keep characters consistent?",
    a: "Yes. The Character Library locks a character's appearance and voice once, and reuses those locked details every time that character appears. A Continuity Checker compares each generated scene against them and flags anything that doesn't match, so you can approve an intentional change or regenerate.",
  },
  {
    q: "Can I upload my own media?",
    a: "Yes — you can upload your own photos, art, video, and other files into your Media Library and reuse them across projects.",
  },
  {
    q: "Can I choose different AI providers or models?",
    a: "Outlet AI Studio is built on provider adapters, so the AI providers behind each step can change without changing how you work. Letting you choose between multiple providers for the same step yourself is planned, not available yet.",
  },
  {
    q: "Does Outlet AI Studio publish directly to social platforms?",
    a: "Not yet — this is planned. Today, you export a complete content package and publish it yourself.",
  },
  {
    q: "Is voice cloning available?",
    a: "No. Any future voice-cloning capability will require explicit, documented consent before it can be used on anyone's voice.",
  },
  {
    q: "Who owns the content I create?",
    a: "You do — subject to our Terms of Service and to the usage terms of the underlying AI providers involved in generating it.",
  },
  {
    q: "Can I cancel my plan?",
    a: "Billing isn't live yet. Once it is, you'll be able to manage or cancel your subscription at any time from your account, with no long-term commitment required.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">FAQ</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Questions creators ask first.
          </h2>
        </div>

        <div className="mt-10 flex flex-col gap-3">
          {FAQS.map((item) => (
            <details key={item.q} className="group rounded-xl border border-border bg-background p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {item.q}
                <span aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
