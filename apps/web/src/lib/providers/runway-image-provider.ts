import type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from "./image";
import { runwayDownload, runwayIsConfigured, runwayPollUntilComplete, runwaySubmit } from "./runway-client";

const MODEL = "gen4_image";

export class RunwayImageProvider implements ImageProvider {
  readonly name = "runway";

  isConfigured(): boolean {
    return runwayIsConfigured();
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    if (!this.isConfigured()) {
      throw new Error("RUNWAYML_API_SECRET is not set.");
    }

    const { id } = await runwaySubmit("/text_to_image", {
      model: MODEL,
      promptText: input.prompt,
      ratio: input.ratio,
    });

    const task = await runwayPollUntilComplete(id);
    if (task.status === "FAILED" || !task.output?.[0]) {
      throw new Error(task.error ?? "Runway image generation failed with no error detail.");
    }

    const { bytes, contentType } = await runwayDownload(task.output[0]);

    return {
      image: bytes,
      contentType: contentType ?? "image/png",
      provider: this.name,
      model: MODEL,
    };
  }
}
