import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium text-accent">Outlet AI Studio</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Button href="/" className="mt-2">
        Go home
      </Button>
    </main>
  );
}
