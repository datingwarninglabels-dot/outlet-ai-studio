import { scriptProvider } from "@/lib/providers";
import { PLATFORMS } from "@/lib/validation";
import { CreateVideoForm } from "./create-video-form";

export default async function CreateVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform } = await searchParams;
  const defaultPlatform = PLATFORMS.find((p) => p === platform) ?? PLATFORMS[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Video</h1>
        <p className="mt-1 text-sm text-muted">
          This writes a script from your idea. Storyboard, voice, and visuals come next — not wired
          up yet.
        </p>
      </div>
      <CreateVideoForm
        scriptProviderConfigured={scriptProvider.isConfigured()}
        defaultPlatform={defaultPlatform}
      />
    </div>
  );
}
