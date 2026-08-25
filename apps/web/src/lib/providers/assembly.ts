export type AssemblyClip = {
  /** A signed URL for an animated clip if this scene has one, else a still image. */
  mediaUrl: string;
  mediaType: "video" | "image";
  durationSeconds: number;
};

export type AssemblyCaption = {
  text: string;
  startSeconds: number;
  durationSeconds: number;
};

export type AssembleVideoInput = {
  clips: AssemblyClip[];
  audioUrl: string;
  captions: AssemblyCaption[];
  aspectRatio: "9:16" | "16:9" | "1:1";
};

export type AssembleVideoResult = {
  video: Buffer;
  contentType: string;
  provider: string;
};

export interface VideoAssemblyProvider {
  readonly name: string;
  isConfigured(): boolean;
  /**
   * Split into submit/poll (M4) rather than one `assemble()` call so a
   * retry after a stall/crash can resume polling an already-submitted
   * render instead of resubmitting — and re-paying for — a brand new one.
   * The caller is responsible for persisting the returned renderId between
   * the two calls.
   */
  submitRender(input: AssembleVideoInput): Promise<{ renderId: string }>;
  pollAndDownload(renderId: string): Promise<AssembleVideoResult>;
}

export function shotstackAspectRatioForPlatform(platform: string): "9:16" | "16:9" {
  const vertical = new Set(["TikTok", "YouTube Short", "Instagram Reel", "Facebook Reel"]);
  return vertical.has(platform) ? "9:16" : "16:9";
}
