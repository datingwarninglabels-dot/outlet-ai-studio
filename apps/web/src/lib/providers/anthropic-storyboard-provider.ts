import Anthropic from "@anthropic-ai/sdk";
import type {
  StoryboardGenerationInput,
  StoryboardGenerationResult,
  StoryboardProvider,
  StoryboardScene,
} from "./storyboard";

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You break a video script into a scene list for production.

Read the whole script and split it into as many scenes as the pacing naturally calls for — each scene
is one continuous shot or visual beat. Short-form scripts usually need only 2-8 scenes; long-form
scripts should get proportionally more (roughly one scene per 15-25 seconds of narration) — do not
artificially cap the count or merge beats together just to keep the list short. For each scene give:
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

// Exported for unit testing (see anthropic-storyboard-provider.test.ts) —
// pure functions, safe to test directly without mocking the Anthropic SDK.
export function isValidSceneEntry(entry: unknown): entry is StoryboardScene {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as Record<string, unknown>).narration === "string" &&
    typeof (entry as Record<string, unknown>).visualDescription === "string" &&
    typeof (entry as Record<string, unknown>).audioDirection === "string" &&
    typeof (entry as Record<string, unknown>).durationSeconds === "number"
  );
}

export function normalizeScene(scene: StoryboardScene): StoryboardScene {
  return {
    narration: scene.narration,
    visualDescription: scene.visualDescription,
    audioDirection: scene.audioDirection,
    durationSeconds: Math.max(1, Math.round(scene.durationSeconds)),
  };
}

/**
 * A long-form scene list can hit the model's output token ceiling mid-array
 * — the response is valid JSON up to that point but gets cut off before the
 * closing `]`. Rather than losing the whole (paid) generation to a parse
 * error, recover the longest valid prefix: walk back to the last `}` that
 * balances its own braces from the start of the array, close the array
 * there, and parse that. Returns null if even that recovery fails.
 */
export function recoverTruncatedArray(raw: string): StoryboardScene[] | null {
  const arrayStart = raw.indexOf("[");
  if (arrayStart === -1) {
    return null;
  }

  // String-aware: a narration/visualDescription value can itself contain
  // literal `{`/`}` characters, which would throw off a naive brace
  // counter and silently recover the wrong prefix. Track whether we're
  // inside a JSON string (respecting `\"` escapes) and ignore braces there.
  let depth = 0;
  let lastCompleteObjectEnd = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        lastCompleteObjectEnd = i;
      }
    }
  }

  if (lastCompleteObjectEnd === -1) {
    return null;
  }

  const recovered = `${raw.slice(arrayStart, lastCompleteObjectEnd + 1)}]`;
  try {
    const parsed: unknown = JSON.parse(recovered);
    if (Array.isArray(parsed) && parsed.every(isValidSceneEntry)) {
      return parsed.map(normalizeScene);
    }
  } catch {
    // Still not valid — give up and let the caller surface the original error.
  }
  return null;
}

export function parseScenes(
  raw: string,
  hitTokenLimit: boolean,
): { scenes: StoryboardScene[]; truncated: boolean } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isValidSceneEntry)) {
      throw new Error("Storyboard provider returned an unexpected shape.");
    }
    return { scenes: parsed.map(normalizeScene), truncated: false };
  } catch (err) {
    if (hitTokenLimit) {
      const recovered = recoverTruncatedArray(raw);
      if (recovered && recovered.length > 0) {
        return { scenes: recovered, truncated: true };
      }
    }
    throw err instanceof Error ? err : new Error("Storyboard provider returned non-JSON output.");
  }
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
    // 8192 comfortably covers long-form scripts (dozens of scenes) — Claude
    // bills by actual output tokens generated, not this ceiling, so setting
    // it generously costs nothing for short scripts that finish well under it.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const { scenes, truncated } = parseScenes(text, message.stop_reason === "max_tokens");

    return {
      scenes,
      provider: this.name,
      model: MODEL,
      truncated,
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
    };
  }
}
