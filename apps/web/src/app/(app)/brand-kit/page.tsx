import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getBrandAssetUrl, getOrCreateBrandKit } from "./actions";
import { BrandAssetUploads, BrandKitForm } from "./brand-kit-form";

export const dynamic = "force-dynamic";

export default async function BrandKitPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const brandKit = await getOrCreateBrandKit(session.user.id);

  const [logoUrl, introUrl, outroUrl] = await Promise.all([
    brandKit.logoAssetId ? getBrandAssetUrl(brandKit.logoAssetId) : Promise.resolve(null),
    brandKit.introAssetId ? getBrandAssetUrl(brandKit.introAssetId) : Promise.resolve(null),
    brandKit.outroAssetId ? getBrandAssetUrl(brandKit.outroAssetId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Brand Kit</h1>
        <p className="mt-1 text-sm text-muted">
          One reusable identity, applied automatically to new projects. A project can override the
          visual style or voice individually on its own page.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Logo, intro, outro</h2>
        <BrandAssetUploads logoUrl={logoUrl} introUrl={introUrl} outroUrl={outroUrl} />
        <p className="text-xs text-muted">
          Stored and available for future rendering steps — burning these into the assembled video
          (watermark overlay, intro/outro splice, styled captions) isn&apos;t wired into Assembly yet.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Defaults</h2>
        <BrandKitForm
          defaults={{
            colors: (brandKit.colors as string[]) ?? [],
            fonts: brandKit.fonts ?? "",
            captionStyle: brandKit.captionStyle ?? "",
            watermarkEnabled: brandKit.watermarkEnabled,
            watermarkText: brandKit.watermarkText ?? "",
            defaultVoiceId: brandKit.defaultVoiceId ?? "",
            defaultMusicMood: brandKit.defaultMusicMood ?? "",
            defaultVisualStyle: brandKit.defaultVisualStyle ?? "",
          }}
        />
        <p className="text-xs text-muted">
          Default visual style is appended to every scene&apos;s image prompt, and default voice ID is
          used for voice generation, unless a project sets its own override. Fonts, caption style,
          watermark, and music mood are stored for a future rendering pass — no pipeline consumes
          them yet.
        </p>
      </section>
    </div>
  );
}
