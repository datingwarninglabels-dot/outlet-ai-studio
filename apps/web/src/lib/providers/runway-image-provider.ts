import type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from "./image";

// Verified against docs.dev.runwayml.com (base URL, auth/version headers,
// text_to_image request shape, task polling shape) as of 2026-08 — Runway's
// API has changed shape before (the version header exists specifically to
// pin behavior), so re-check if this starts failing outright rather than
// assuming the integration is simply wrong.
const BASE_URL = "https://api.dev.runwayml.com/v1";
const API_VERSION = "2024-11-06";
const MODEL = "gen4_image";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

type RunwayTask = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "THROTTLED";
  output?: string[];
  error?: string;
};

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "Content-Type": "application/json",
    "X-Runway-Version": API_VERSION,
  };
}

async function pollUntilComplete(taskId: string): Promise<RunwayTask> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${BASE_URL}/tasks/${taskId}`, { headers: headers() });
    if (!response.ok) {
      const err = new Error(`Runway task status request failed (${response.status})`) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }

    const task = (await response.json()) as RunwayTask;
    if (task.status === "SUCCEEDED" || task.status === "FAILED") {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Runway image generation timed out waiting for the task to complete.");
}

export class RunwayImageProvider implements ImageProvider {
  readonly name = "runway";

  isConfigured(): boolean {
    return Boolean(process.env.RUNWAYML_API_SECRET);
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    if (!this.isConfigured()) {
      throw new Error("RUNWAYML_API_SECRET is not set.");
    }

    const submitResponse = await fetch(`${BASE_URL}/text_to_image`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: MODEL,
        promptText: input.prompt,
        ratio: input.ratio,
      }),
    });

    if (!submitResponse.ok) {
      const err = new Error(`Runway text_to_image request failed (${submitResponse.status})`) as Error & {
        status?: number;
      };
      err.status = submitResponse.status;
      throw err;
    }

    const { id } = (await submitResponse.json()) as { id: string };
    const task = await pollUntilComplete(id);

    if (task.status === "FAILED" || !task.output?.[0]) {
      throw new Error(task.error ?? "Runway image generation failed with no error detail.");
    }

    const imageResponse = await fetch(task.output[0]);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image (${imageResponse.status}).`);
    }

    return {
      image: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") ?? "image/png",
      provider: this.name,
      model: MODEL,
    };
  }
}
