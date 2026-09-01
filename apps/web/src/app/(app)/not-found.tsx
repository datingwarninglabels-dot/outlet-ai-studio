import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="max-w-sm text-sm text-muted">
        This page, or whatever it was pointing at, doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 flex h-11 items-center rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-5 text-sm font-medium text-black"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
