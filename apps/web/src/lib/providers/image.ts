export type ImageReference = {
  /** Must be a URL the provider can fetch — a signed storage URL works. */
  uri: string;
  /** Referenced by this name in the prompt text, e.g. "the person tagged IDENTITY". */
  tag: string;
};

export type ImageGenerationInput = {
  prompt: string;
  /** Runway ratio string, e.g. "720:1280" for vertical, "1280:720" for landscape. */
  ratio: string;
  /** Up to 3 — used for character/identity consistency (Section 10). */
  referenceImages?: ImageReference[];
};

export type ImageGenerationResult = {
  image: Buffer;
  contentType: string;
  provider: string;
  model: string;
};

export interface ImageProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}

export function ratioForPlatform(platform: string): string {
  const vertical = new Set(["TikTok", "YouTube Short", "Instagram Reel", "Facebook Reel"]);
  return vertical.has(platform) ? "720:1280" : "1280:720";
}

/** Full-resolution ratio for thumbnails/covers — sharper than scene visuals need. */
export function thumbnailRatioForPlatform(platform: string): { ratio: string; width: number; height: number } {
  const vertical = new Set(["TikTok", "YouTube Short", "Instagram Reel", "Facebook Reel"]);
  return vertical.has(platform)
    ? { ratio: "1080:1920", width: 1080, height: 1920 }
    : { ratio: "1920:1080", width: 1920, height: 1080 };
}
