import type {
  AssembleVideoInput,
  AssembleVideoResult,
  AssemblyClip,
  VideoAssemblyProvider,
} from "./assembly";

// Verified against shotstack.io/docs/api and shotstack.io/pricing as of
// 2026-08: base URL, x-api-key header, /render POST + GET /render/{id}
// polling shape, timeline.tracks[].clips[] structure, and $0.30/min PAYG
// pricing at 1080p. Re-check if this starts failing outright rather than
// assuming the integration is simply wrong.
const ENV = process.env.SHOTSTACK_ENV === "stage" ? "stage" : "v1";
const BASE_URL = `https://api.shotstack.io/edit/${ENV}`;

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 90; // ~6 minutes — full renders take longer than a single image/clip

type ShotstackRenderStatus = {
  response: {
    id: string;
    status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
    url?: string;
    error?: string;
  };
};

function headers(): Record<string, string> {
  return {
    "x-api-key": process.env.SHOTSTACK_API_KEY!,
    "Content-Type": "application/json",
  };
}

function buildClip(clip: AssemblyClip, start: number) {
  return {
    asset: { type: clip.mediaType, src: clip.mediaUrl },
    start,
    length: clip.durationSeconds,
  };
}

async function pollUntilComplete(id: string): Promise<ShotstackRenderStatus["response"]> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${BASE_URL}/render/${id}`, { headers: headers() });
    if (!response.ok) {
      const err = new Error(`Shotstack render status request failed (${response.status})`) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }

    const body = (await response.json()) as ShotstackRenderStatus;
    if (body.response.status === "done" || body.response.status === "failed") {
      return body.response;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Shotstack render timed out waiting for the task to complete.");
}

export class ShotstackAssemblyProvider implements VideoAssemblyProvider {
  readonly name = "shotstack";

  isConfigured(): boolean {
    return Boolean(process.env.SHOTSTACK_API_KEY);
  }

  async submitRender(input: AssembleVideoInput): Promise<{ renderId: string }> {
    if (!this.isConfigured()) {
      throw new Error("SHOTSTACK_API_KEY is not set.");
    }

    let cursor = 0;
    const videoTrackClips = input.clips.map((clip) => {
      const built = buildClip(clip, cursor);
      cursor += clip.durationSeconds;
      return built;
    });

    const captionTrackClips = input.captions.map((caption) => ({
      asset: { type: "text" as const, text: caption.text },
      start: caption.startSeconds,
      length: caption.durationSeconds,
    }));

    const submitResponse = await fetch(`${BASE_URL}/render`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        timeline: {
          soundtrack: { src: input.audioUrl, effect: "fadeOut" },
          background: "#000000",
          tracks: [{ clips: captionTrackClips }, { clips: videoTrackClips }],
        },
        output: {
          format: "mp4",
          resolution: "hd",
          aspectRatio: input.aspectRatio,
        },
      }),
    });

    if (!submitResponse.ok) {
      const err = new Error(`Shotstack render request failed (${submitResponse.status})`) as Error & {
        status?: number;
      };
      err.status = submitResponse.status;
      throw err;
    }

    const submitBody = (await submitResponse.json()) as { response: { id: string } };
    return { renderId: submitBody.response.id };
  }

  async pollAndDownload(renderId: string): Promise<AssembleVideoResult> {
    if (!this.isConfigured()) {
      throw new Error("SHOTSTACK_API_KEY is not set.");
    }

    const result = await pollUntilComplete(renderId);

    if (result.status === "failed" || !result.url) {
      throw new Error(result.error ?? "Shotstack render failed with no error detail.");
    }

    const videoResponse = await fetch(result.url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download assembled video (${videoResponse.status}).`);
    }

    return {
      video: Buffer.from(await videoResponse.arrayBuffer()),
      contentType: videoResponse.headers.get("content-type") ?? "video/mp4",
      provider: this.name,
    };
  }
}
