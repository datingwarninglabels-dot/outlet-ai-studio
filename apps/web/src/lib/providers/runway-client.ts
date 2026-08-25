// Shared low-level client for Runway's task-based generation endpoints
// (text_to_image, image_to_video, ...). Verified against docs.dev.runwayml.com
// (base URL, auth/version headers, task polling shape) as of 2026-08 —
// Runway's API has changed shape before (the version header exists
// specifically to pin behavior), so re-check if this starts failing outright
// rather than assuming the integration is simply wrong.
export const RUNWAY_BASE_URL = "https://api.dev.runwayml.com/v1";
export const RUNWAY_API_VERSION = "2024-11-06";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // ~3 minutes — video tasks run longer than image ones

export type RunwayTask = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "THROTTLED";
  output?: string[];
  error?: string;
};

export function runwayIsConfigured(): boolean {
  return Boolean(process.env.RUNWAYML_API_SECRET);
}

export function runwayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAY_API_VERSION,
  };
}

function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function runwaySubmit(endpoint: string, body: unknown): Promise<{ id: string }> {
  const response = await fetch(`${RUNWAY_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: runwayHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw httpError(`Runway ${endpoint} request failed (${response.status})`, response.status);
  }

  return (await response.json()) as { id: string };
}

export async function runwayPollUntilComplete(taskId: string): Promise<RunwayTask> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${RUNWAY_BASE_URL}/tasks/${taskId}`, { headers: runwayHeaders() });
    if (!response.ok) {
      throw httpError(`Runway task status request failed (${response.status})`, response.status);
    }

    const task = (await response.json()) as RunwayTask;
    if (task.status === "SUCCEEDED" || task.status === "FAILED") {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Runway generation timed out waiting for the task to complete.");
}

export async function runwayDownload(url: string): Promise<{ bytes: Buffer; contentType: string | null }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Runway output (${response.status}).`);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}
