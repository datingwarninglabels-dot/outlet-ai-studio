import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NAV_ITEMS } from "@/lib/nav";
import { AppShell } from "./app-shell";

// Session-dependent data (nav visibility, the signed-in user's own email) —
// never statically cache it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const navItems = NAV_ITEMS.filter((item) => !item.ownerOnly || session.user.role === "owner");

  return (
    <AppShell navItems={navItems} userEmail={session.user.email ?? ""}>
      {children}
    </AppShell>
  );
}
