import Anthropic from "@anthropic-ai/sdk";
import type {
  StoryboardGenerationInput,
  StoryboardGenerationResult,
  StoryboardProvider,
} from "./storyboard";

const MODEL = "claude-sonnet-5";

// M1 ships a single-scene storyboard only (the whole script as one shot) —
// multi-scene chapter/scene breakdown is scoped to M2. The output shape
// (an array) already supports that later without changing this boundary.
const SYSTEM_PROMPT = `You turn a short-form video script into a single storyboard scene description.
Read the whole script and produce exactly one scene covering the entire video: the narration text
(the script's voiceover line, verbatim or lightly trimmed for pacing), a concrete visual description
suitable as an image/video generation prompt (concrete subject, setting, camera framing, lighting —
no vague language), and an estimated spoken duration in seconds (assume roughly 150 words per minute).

Respond with ONLY a JSON object, no markdown fences, no preamble, in this exact shape:
{"narration": string, "visualDescription": string, "durationSeconds": number}`;

function buildPrompt(input: StoryboardGenerationInput): string {
  return `Platform: ${input.platform}\n\nScript:\n${input.script}`;
}

function parseScene(raw: string): { narration: string; visualDescription: string; durationSeconds: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Storyboard provider returned non-JSON output.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).narration !== "string" ||
    typeof (parsed as Record<string, unknown>).visualDescription !== "string" ||
    typeof (parsed as Record<string, unknown>).durationSeconds !== "number"
  ) {
    throw new Error("Storyboard provider returned an unexpected shape.");
  }

  const scene = parsed as { narration: string; visualDescription: string; durationSeconds: number };
  return {
    narration: scene.narration,
    visualDescription: scene.visualDescription,
    durationSeconds: Math.max(1, Math.round(scene.durationSeconds)),
  };
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const scene = parseScene(text);

    return {
      scenes: [scene],
      provider: this.name,
      model: MODEL,
    };
  }
}
