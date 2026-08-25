export type ImageGenerationInput = {
  prompt: string;
  /** Runway ratio string, e.g. "720:1280" for vertical, "1280:720" for landscape. */
  ratio: string;
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
