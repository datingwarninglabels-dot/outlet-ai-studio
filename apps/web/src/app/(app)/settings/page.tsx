import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await auth();
  const [account] = session?.user
    ? await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    : [];

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Account details.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <div>
          <p className="text-xs text-muted">Name</p>
          <p className="text-sm">{account?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Email</p>
          <p className="text-sm">{account?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Account since</p>
          <p className="text-sm">{account?.createdAt?.toLocaleDateString() ?? "—"}</p>
        </div>
      </section>

      <p className="text-xs text-muted">
        Two-factor authentication and session/device management aren&apos;t available yet.
      </p>
    </div>
  );
}
