// A skeleton instead of a blank page while a page's server-side data
// fetch resolves — every (app) page does at least one DB round trip
// before rendering.
export default function AppLoading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="h-6 w-48 animate-pulse rounded bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
