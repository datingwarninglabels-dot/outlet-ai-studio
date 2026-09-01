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

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  // Matches setupSchema's bar, not loginSchema's weaker one — this creates
  // an account, same as /setup does.
  password: z.string().min(12),
  // Honeypot — same pattern as waitlistSchema.
  website: z.string().max(0).optional(),
});

export const CREATOR_TYPES = [
  "Faceless content creator",
  "YouTube / YouTube Shorts",
  "TikTok",
  "Facebook / Instagram Reels",
  "Marketer or small business",
  "Storyteller (characters & worlds)",
  "Other",
] as const;

export const waitlistSchema = z.object({
  email: z.string().email().max(320),
  creatorType: z.enum(CREATOR_TYPES).optional(),
  consent: z.literal(true, { message: "Consent is required to join the waitlist." }),
  // Honeypot: a real visitor never sees or fills this field (hidden via
  // CSS, not `type="hidden"`, so it still gets tabbed past by nothing and
  // autofilled by nothing legitimate) — a filled value means a bot.
  website: z.string().max(0).optional(),
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

const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

export const sceneUpdateSchema = z.object({
  sceneId: z.string().uuid(),
  narration: z.string().min(1).max(4000),
  visualDescription: z.string().min(1).max(2000),
  audioDirection: z.string().max(500),
  durationSeconds: z.coerce.number().int().min(1).max(3600),
  characterId: optionalUuid,
  worldId: optionalUuid,
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

const optionalField = z
  .string()
  .max(300)
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));

export const characterSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(1000),
    face: optionalField,
    skinTone: optionalField,
    hair: optionalField,
    bodyType: optionalField,
    apparentAge: optionalField,
    distinguishingDetails: optionalField,
    defaultClothing: optionalField,
    accessories: optionalField,
    palette: optionalField,
    negativePrompt: z
      .string()
      .max(500)
      .optional()
      .transform((v) => (v?.trim() ? v.trim() : null)),
    assignedVoiceId: optionalField,
    isRealPerson: z.boolean(),
    permissionNotes: z
      .string()
      .max(1000)
      .optional()
      .transform((v) => (v?.trim() ? v.trim() : null)),
  })
  // Section 10: real-person characters require documented permission — enforced
  // here, not just left to the UI, since this is a safety requirement.
  .refine((data) => !data.isRealPerson || Boolean(data.permissionNotes), {
    message: "Real-person characters require documented permission notes.",
    path: ["permissionNotes"],
  });

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #3366FF");

export const projectOverridesSchema = z.object({
  visualStyleOverride: optionalField,
  voiceIdOverride: optionalField,
});

export const brandKitSchema = z.object({
  colors: z.array(hexColor).max(6),
  fonts: optionalField,
  captionStyle: optionalField,
  watermarkEnabled: z.boolean(),
  watermarkText: optionalField,
  defaultVoiceId: optionalField,
  defaultMusicMood: optionalField,
  defaultVisualStyle: optionalField,
});

export const worldSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  locationDescription: optionalField,
  propsVehicles: optionalField,
  outfitsAccessories: optionalField,
  lightingPalette: optionalField,
  cameraStyle: optionalField,
  animationStyle: optionalField,
  timeOfDay: optionalField,
  weather: optionalField,
  negativePrompt: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
});
