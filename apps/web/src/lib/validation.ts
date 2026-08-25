import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const setupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(12),
});

export const PLATFORMS = [
  "TikTok",
  "YouTube Short",
  "YouTube Video",
  "Facebook Reel",
  "Instagram Reel",
  "Custom Project",
] as const;

export const createVideoSchema = z.object({
  idea: z.string().min(3).max(2000),
  platform: z.enum(PLATFORMS),
  mode: z.enum(["quick", "guided", "studio"]),
});

export const sceneUpdateSchema = z.object({
  sceneId: z.string().uuid(),
  narration: z.string().min(1).max(4000),
  visualDescription: z.string().min(1).max(2000),
  audioDirection: z.string().max(500),
  durationSeconds: z.coerce.number().int().min(1).max(3600),
});

// Section 15's style list. promptModifier is appended to a base prompt
// built from the project title (and scene 1's visual, if there is one).
export const THUMBNAIL_STYLES = [
  { key: "faceless", label: "Faceless", promptModifier: "no visible human faces, object or scene-focused composition" },
  { key: "dramatic", label: "Dramatic", promptModifier: "high-contrast dramatic lighting, intense mood, cinematic" },
  { key: "clean", label: "Clean", promptModifier: "minimal, clean, bright, uncluttered composition" },
  { key: "news", label: "News", promptModifier: "news-broadcast style, bold serious tone, graphic overlay aesthetic" },
  { key: "gaming", label: "Gaming", promptModifier: "vibrant gaming aesthetic, energetic, saturated colors" },
  { key: "curiosity", label: "Curiosity", promptModifier: "intriguing, mysterious framing, partial reveal that invites curiosity" },
] as const;

export const thumbnailTextSchema = z.object({
  thumbnailId: z.string().uuid(),
  headlineText: z.string().max(120),
});
