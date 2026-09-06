import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "./settings-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const [account] = session?.user
    ? await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    : [];

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <PageHeader title="Settings" description="Your account and sign-in." />

      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-muted">Email</p>
          <p className="text-sm">{account?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Account since</p>
          <p className="text-sm">{account?.createdAt?.toLocaleDateString() ?? "—"}</p>
        </div>
      </Card>

      <ProfileForm name={account?.name ?? ""} />
      <PasswordForm canChangePassword={Boolean(account?.passwordHash)} />
      <DeleteAccountForm isOwner={session?.user?.role === "owner"} />

      <p className="text-xs text-muted">
        Two-factor authentication and session/device management aren&apos;t available yet.
      </p>
    </div>
  );
}
