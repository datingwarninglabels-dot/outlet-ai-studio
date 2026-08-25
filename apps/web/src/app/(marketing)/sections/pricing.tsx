import { PLANS } from "@/lib/plans";
import { CTA_MODE, PRIMARY_CTA_LABEL, primaryCtaHref } from "@/lib/site-config";

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Plans built around credits, not guesswork.
          </h2>
          <p className="mt-4 text-muted">
            Generation uses credits — different models and output types (a script, a scene image, a
            full video render) use different amounts. Final pricing and credit allowances are still
            being finalized against real provider costs.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col gap-5 rounded-2xl border p-6 ${
                plan.highlighted ? "border-accent bg-background shadow-lg shadow-accent/10" : "border-border bg-background"
              }`}
            >
              <div>
                {plan.highlighted && (
                  <span className="mb-2 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    Recommended
                  </span>
                )}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
              </div>

              <div>
                <p className="text-2xl font-bold">{plan.priceLabel}</p>
                <p className="mt-1 text-xs text-muted">{plan.creditsNote}</p>
              </div>

              <ul className="flex flex-1 flex-col gap-2 text-sm text-muted">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={primaryCtaHref()}
                className={`flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium ${
                  plan.highlighted
                    ? "bg-accent text-accent-foreground hover:bg-accent-strong"
                    : "border border-border hover:bg-surface"
                }`}
              >
                {CTA_MODE === "waitlist" || CTA_MODE === "early-access" ? PRIMARY_CTA_LABEL : `Choose ${plan.name}`}
              </a>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-muted">
          Never an unlimited-generation claim — every plan is credit-based, and credit costs are
          shown before you confirm a generation.
        </p>
      </div>
    </section>
  );
}
