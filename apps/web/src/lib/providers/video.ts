export type VideoGenerationInput = {
  /** Must be a URL Runway's servers can fetch — a signed storage URL works. */
  imageUrl: string;
  prompt: string;
  ratio: string;
  durationSeconds: 5 | 10;
};

export type VideoGenerationResult = {
  video: Buffer;
  contentType: string;
  provider: string;
  model: string;
};

export interface VideoProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: VideoGenerationInput): Promise<VideoGenerationResult>;
}
