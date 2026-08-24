import Anthropic from "@anthropic-ai/sdk";
import type { ScriptGenerationInput, ScriptGenerationResult, ScriptProvider } from "./script";

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You write short-form faceless-video scripts for TikTok, YouTube Shorts,
YouTube, Facebook Reels, and Instagram Reels. Write a hook, a body broken into narration beats
suitable for scene-by-scene visuals, and a closing line. Keep language plain and platform-appropriate.
Do not claim the video has capabilities it doesn't — this is narration text only, no visual directions
unless asked. Output the script only, no preamble or explanation.`;

function buildPrompt(input: ScriptGenerationInput): string {
  const modeNote =
    input.mode === "quick"
      ? "Make all creative choices yourself — the Owner wants a finished draft with minimal back and forth."
      : input.mode === "guided"
        ? "Write a solid first draft; the Owner will review and request changes before this is finalized."
        : "Write a draft the Owner has full manual control to rework scene by scene.";

  return `Platform: ${input.platform}\nMode: ${input.mode} (${modeNote})\n\nIdea: ${input.idea}`;
}

export class AnthropicScriptProvider implements ScriptProvider {
  readonly name = "anthropic";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generate(input: ScriptGenerationInput): Promise<ScriptGenerationResult> {
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

    const content = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      content,
      provider: this.name,
      model: MODEL,
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
    };
  }
}
