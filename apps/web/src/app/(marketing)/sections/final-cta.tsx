import { WaitlistForm } from "../waitlist-form";

export function FinalCta() {
  return (
    <section id="waitlist" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-8 text-center sm:p-12">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Your idea. Your voice. Your outlet.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Join the waitlist to be first in when Outlet AI Studio opens up — one connected workspace
          for the whole creative process.
        </p>
        <div className="mx-auto mt-8 max-w-md text-left">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
