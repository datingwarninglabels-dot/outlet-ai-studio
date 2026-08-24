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
