import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await auth();
  const [owner] = session?.user
    ? await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    : [];

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Owner account details.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <div>
          <p className="text-xs text-muted">Name</p>
          <p className="text-sm">{owner?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Email</p>
          <p className="text-sm">{owner?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Two-factor authentication</p>
          <p className="text-sm text-muted">
            {owner?.twoFactorEnabled ? "Enabled" : "Not set up yet"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Owner since</p>
          <p className="text-sm">{owner?.createdAt?.toLocaleDateString() ?? "—"}</p>
        </div>
      </section>

      <p className="text-xs text-muted">
        Session/device management, two-factor setup, and API key visibility land alongside the
        Provider Hub milestone.
      </p>
    </div>
  );
}
