import Anthropic from "@anthropic-ai/sdk";
import type {
  StoryboardGenerationInput,
  StoryboardGenerationResult,
  StoryboardProvider,
  StoryboardScene,
} from "./storyboard";

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You break a short-form video script into a scene list for production.

Read the whole script and split it into as many scenes as the pacing naturally calls for (usually
2-8 for short-form content) — each scene is one continuous shot or visual beat. For each scene give:
narration (the script's voiceover line for that beat, verbatim or lightly trimmed for pacing), a
concrete visual description suitable as an image/video generation prompt (concrete subject, setting,
camera framing, lighting — no vague language), audio direction (music mood, sound effects, or pacing
notes — plain text, can be "none" if nothing specific applies), and an estimated spoken duration in
seconds (assume roughly 150 words per minute).

Respond with ONLY a JSON array, no markdown fences, no preamble, in this exact shape:
[{"narration": string, "visualDescription": string, "audioDirection": string, "durationSeconds": number}, ...]
Scenes must be in narration order.`;

function buildPrompt(input: StoryboardGenerationInput): string {
  return `Platform: ${input.platform}\n\nScript:\n${input.script}`;
}

function parseScenes(raw: string): StoryboardScene[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Storyboard provider returned non-JSON output.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Storyboard provider returned an empty or non-array scene list.");
  }

  return parsed.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).narration !== "string" ||
      typeof (entry as Record<string, unknown>).visualDescription !== "string" ||
      typeof (entry as Record<string, unknown>).audioDirection !== "string" ||
      typeof (entry as Record<string, unknown>).durationSeconds !== "number"
    ) {
      throw new Error(`Storyboard provider returned an unexpected shape for scene ${index}.`);
    }

    const scene = entry as StoryboardScene;
    return {
      narration: scene.narration,
      visualDescription: scene.visualDescription,
      audioDirection: scene.audioDirection,
      durationSeconds: Math.max(1, Math.round(scene.durationSeconds)),
    };
  });
}

export class AnthropicStoryboardProvider implements StoryboardProvider {
  readonly name = "anthropic";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generate(input: StoryboardGenerationInput): Promise<StoryboardGenerationResult> {
    if (!this.isConfigured()) {
      throw new Error("ANTHROPIC_API_KEY is not set.");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      scenes: parseScenes(text),
      provider: this.name,
      model: MODEL,
    };
  }
}
