import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NAV_ITEMS } from "@/lib/nav";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

// This whole section is Owner-only, session-dependent data — never
// statically cache it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">Outlet AI Studio</p>
          <p className="text-xs text-muted">Your idea. Your voice. Your outlet.</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="truncate text-xs text-muted">{session.user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
