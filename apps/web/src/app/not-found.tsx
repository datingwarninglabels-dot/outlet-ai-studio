import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm text-accent-teal">Outlet AI Studio</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-5 text-sm font-medium text-black"
      >
        Go home
      </Link>
    </main>
  );
}
