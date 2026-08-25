import type { VideoGenerationInput, VideoGenerationResult, VideoProvider } from "./video";
import { runwayDownload, runwayIsConfigured, runwayPollUntilComplete, runwaySubmit } from "./runway-client";

// gen4_turbo, not gen4.5 — 5 credits/sec ($0.05/sec) vs. gen4.5's 12
// credits/sec, and turbo is the model actually documented as the
// image_to_video default in Runway's API reference as of 2026-08.
const MODEL = "gen4_turbo";

export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";

  isConfigured(): boolean {
    return runwayIsConfigured();
  }

  async generate(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    if (!this.isConfigured()) {
      throw new Error("RUNWAYML_API_SECRET is not set.");
    }

    const { id } = await runwaySubmit("/image_to_video", {
      model: MODEL,
      promptImage: input.imageUrl,
      promptText: input.prompt,
      ratio: input.ratio,
      duration: input.durationSeconds,
    });

    const task = await runwayPollUntilComplete(id);
    if (task.status === "FAILED" || !task.output?.[0]) {
      throw new Error(task.error ?? "Runway video generation failed with no error detail.");
    }

    const { bytes, contentType } = await runwayDownload(task.output[0]);

    return {
      video: bytes,
      contentType: contentType ?? "video/mp4",
      provider: this.name,
      model: MODEL,
    };
  }
}
