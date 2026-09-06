"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, useActionToast } from "@/components/ui";
import { updateBrandKit, uploadIntro, uploadLogo, uploadOutro } from "./actions";

const initialState = { error: "" };

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <Field id={name} label={label}>
      <Input name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} maxLength={300} />
    </Field>
  );
}

export function BrandKitForm({
  defaults,
}: {
  defaults: {
    colors: string[];
    fonts: string;
    captionStyle: string;
    watermarkEnabled: boolean;
    watermarkText: string;
    defaultVoiceId: string;
    defaultMusicMood: string;
    defaultVisualStyle: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateBrandKit, initialState);
  useActionToast(state, pending, "Brand Kit saved.");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="colors" label="Brand colors" hint="Comma-separated hex, up to 6.">
        <Input
          name="colors"
          defaultValue={defaults.colors.join(", ")}
          placeholder="#3366FF, #1A1A2E"
          maxLength={300}
        />
      </Field>
      {defaults.colors.length > 0 && (
        <div className="-mt-2 flex gap-2">
          {defaults.colors.map((c) => (
            <span key={c} title={c} className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: c }} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Fonts" name="fonts" defaultValue={defaults.fonts} placeholder="Montserrat, Arial" />
        <TextField label="Default voice ID (ElevenLabs)" name="defaultVoiceId" defaultValue={defaults.defaultVoiceId} />
        <TextField
          label="Default visual style"
          name="defaultVisualStyle"
          defaultValue={defaults.defaultVisualStyle}
          placeholder="cinematic realism, warm tones"
        />
        <TextField label="Default music mood" name="defaultMusicMood" defaultValue={defaults.defaultMusicMood} />
        <TextField
          label="Caption style (descriptive)"
          name="captionStyle"
          defaultValue={defaults.captionStyle}
          placeholder="bold white text, black outline, bottom third"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="watermarkEnabled" defaultChecked={defaults.watermarkEnabled} />
        Show a watermark
      </label>
      <TextField label="Watermark text" name="watermarkText" defaultValue={defaults.watermarkText} />

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Button type="submit" pending={pending} pendingLabel="Saving…" className="w-fit">
        Save Brand Kit
      </Button>
    </form>
  );
}

function AssetUploadForm({
  label,
  action,
  accept,
  currentUrl,
}: {
  label: string;
  action: typeof uploadLogo;
  accept: string;
  currentUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast(state, pending, `${label} uploaded.`);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {currentUrl &&
        (accept === "image/*" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset
          <img src={currentUrl} alt={label} loading="lazy" className="h-24 w-auto rounded border border-border" />
        ) : (
          <video controls preload="none" src={currentUrl} className="h-24 w-auto rounded border border-border" />
        ))}
      <form action={formAction} className="flex flex-col gap-2">
        <input
          type="file"
          name="file"
          accept={accept}
          required
          aria-label={`${label} file`}
          className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm"
        />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Uploading…" className="w-fit">
          {currentUrl ? "Replace" : "Upload"}
        </Button>
      </form>
    </div>
  );
}

export function BrandAssetUploads({
  logoUrl,
  introUrl,
  outroUrl,
}: {
  logoUrl: string | null;
  introUrl: string | null;
  outroUrl: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <AssetUploadForm label="Logo" action={uploadLogo} accept="image/*" currentUrl={logoUrl} />
      <AssetUploadForm label="Intro clip" action={uploadIntro} accept="video/*" currentUrl={introUrl} />
      <AssetUploadForm label="Outro clip" action={uploadOutro} accept="video/*" currentUrl={outroUrl} />
    </div>
  );
}
