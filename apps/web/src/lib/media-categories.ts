export const MEDIA_CATEGORIES = [
  { key: "photo", label: "Photo", accept: "image/*", kind: "image" as const },
  { key: "art", label: "Art / graphic", accept: "image/*", kind: "image" as const },
  { key: "logo", label: "Logo", accept: "image/*", kind: "image" as const },
  { key: "video", label: "Video", accept: "video/*", kind: "video" as const },
  { key: "music", label: "Music", accept: "audio/*", kind: "audio" as const },
  { key: "sound_effect", label: "Sound effect", accept: "audio/*", kind: "audio" as const },
  { key: "voice_recording", label: "Voice recording", accept: "audio/*", kind: "audio" as const },
  { key: "script", label: "Script", accept: ".txt,.md,text/plain,text/markdown", kind: "text" as const },
  { key: "subtitle", label: "Subtitle file", accept: ".srt,.vtt", kind: "text" as const },
] as const;

export type MediaCategoryKey = (typeof MEDIA_CATEGORIES)[number]["key"];
