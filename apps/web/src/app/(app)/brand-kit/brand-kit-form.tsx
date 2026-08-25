"use client";

import { useActionState } from "react";
import { updateBrandKit, uploadIntro, uploadLogo, uploadOutro } from "./actions";

const initialState = { error: "" };

function Field({
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
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        maxLength={300}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
      />
    </div>
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="colors" className="text-xs text-muted">
          Brand colors (comma-separated hex, up to 6)
        </label>
        <input
          id="colors"
          name="colors"
          defaultValue={defaults.colors.join(", ")}
          placeholder="#3366FF, #1A1A2E"
          maxLength={300}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:border-accent-teal"
        />
        {defaults.colors.length > 0 && (
          <div className="mt-1 flex gap-2">
            {defaults.colors.map((c) => (
              <span key={c} title={c} className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Fonts" name="fonts" defaultValue={defaults.fonts} placeholder="Montserrat, Arial" />
        <Field
          label="Default voice ID (ElevenLabs, optional)"
          name="defaultVoiceId"
          defaultValue={defaults.defaultVoiceId}
        />
        <Field
          label="Default visual style"
          name="defaultVisualStyle"
          defaultValue={defaults.defaultVisualStyle}
          placeholder="cinematic realism, warm tones"
        />
        <Field label="Default music mood" name="defaultMusicMood" defaultValue={defaults.defaultMusicMood} />
        <Field
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
      <Field label="Watermark text" name="watermarkText" defaultValue={defaults.watermarkText} />

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Brand Kit"}
      </button>
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

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm font-medium">{label}</p>
      {currentUrl &&
        (accept === "image/*" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed private-storage URL, not an optimizable static asset
          <img src={currentUrl} alt={label} className="h-24 w-auto rounded border border-border" />
        ) : (
          <video controls src={currentUrl} className="h-24 w-auto rounded border border-border" />
        ))}
      <form action={formAction} className="flex flex-col gap-2">
        <input
          type="file"
          name="file"
          accept={accept}
          required
          className="text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm"
        />
        {state.error && (
          <p role="alert" className="text-xs text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-9 w-fit rounded-lg border border-border px-3 text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Uploading..." : currentUrl ? "Replace" : "Upload"}
        </button>
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
