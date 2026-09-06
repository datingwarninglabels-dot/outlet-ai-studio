// Human-readable labels for the raw enum-ish strings stored on jobs. Keeps
// "storyboard" / "awaiting_confirmation" out of the UI. Unit-tested so a
// new job type or status can't silently fall through to a raw string
// without the test noticing.

export const JOB_TYPE_LABEL: Record<string, string> = {
  script: "Script",
  storyboard: "Storyboard",
  voice: "Voice",
  visual: "Visuals",
  animation: "Animation",
  assembly: "Final video",
  thumbnail: "Thumbnails",
  "character-images": "Character references",
  "world-images": "World references",
};

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  awaiting_confirmation: "Awaiting confirmation",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export const JOB_STATUS_TONE: Record<string, BadgeTone> = {
  queued: "neutral",
  awaiting_confirmation: "warning",
  running: "accent",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
};

export function jobTypeLabel(type: string): string {
  return JOB_TYPE_LABEL[type] ?? type;
}

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABEL[status] ?? status;
}

export function jobStatusTone(status: string): BadgeTone {
  return JOB_STATUS_TONE[status] ?? "neutral";
}
