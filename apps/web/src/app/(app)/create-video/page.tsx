import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { getEntitlement } from "@/lib/entitlements";
import { scriptProvider } from "@/lib/providers";
import { PLATFORMS } from "@/lib/validation";
import { CreateVideoForm } from "./create-video-form";
import { Paywall } from "../paywall";

export default async function CreateVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; idea?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { platform, idea } = await searchParams;
  const defaultPlatform = PLATFORMS.find((p) => p === platform) ?? PLATFORMS[0];
  // A prefilled idea can arrive from the dashboard's "start from an example"
  // link. Trim to the schema's ceiling so an over-long query param can't
  // make the form un-submittable.
  const defaultIdea = typeof idea === "string" ? idea.slice(0, 2000) : "";
  const entitlement = await getEntitlement(session.user.id);
  const outOfCredits = entitlement.remainingCreditCents <= 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Create a video"
        description="Start with your idea — this writes the script. Storyboard, voice, visuals, and export continue from there on the project page."
      />
      {outOfCredits ? (
        <Paywall />
      ) : (
        <CreateVideoForm
          scriptProviderConfigured={scriptProvider.isConfigured()}
          defaultPlatform={defaultPlatform}
          defaultIdea={defaultIdea}
        />
      )}
    </div>
  );
}
