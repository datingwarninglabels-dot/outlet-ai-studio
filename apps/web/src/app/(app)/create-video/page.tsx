import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getEntitlement } from "@/lib/entitlements";
import { scriptProvider } from "@/lib/providers";
import { PLATFORMS } from "@/lib/validation";
import { CreateVideoForm } from "./create-video-form";
import { Paywall } from "../paywall";

export default async function CreateVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { platform } = await searchParams;
  const defaultPlatform = PLATFORMS.find((p) => p === platform) ?? PLATFORMS[0];
  const entitlement = await getEntitlement(session.user.id);
  const outOfCredits = entitlement.remainingCreditCents <= 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Video</h1>
        <p className="mt-1 text-sm text-muted">
          Start with your idea — this writes the script. Storyboard, voice, and visuals continue
          from there on the project page.
        </p>
      </div>
      {outOfCredits ? (
        <Paywall />
      ) : (
        <CreateVideoForm
          scriptProviderConfigured={scriptProvider.isConfigured()}
          defaultPlatform={defaultPlatform}
        />
      )}
    </div>
  );
}
