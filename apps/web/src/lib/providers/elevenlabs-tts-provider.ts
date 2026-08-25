import type { TTSGenerationInput, TTSGenerationResult, TTSProvider } from "./tts";

const MODEL = "eleven_turbo_v2_5";
// ElevenLabs' premade "Rachel" voice — a reasonable default until Voice
// Studio (Section 13) lets the Owner pick one. Overridable via env so a
// deploy can pin a different default without a code change.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";

  isConfigured(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  }

  async generate(input: TTSGenerationInput): Promise<TTSGenerationResult> {
    if (!this.isConfigured()) {
      throw new Error("ELEVENLABS_API_KEY is not set.");
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: MODEL,
      }),
    });

    if (!response.ok) {
      const err = new Error(`ElevenLabs request failed (${response.status})`) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }

    const audio = Buffer.from(await response.arrayBuffer());

    return {
      audio,
      contentType: "audio/mpeg",
      provider: this.name,
      model: MODEL,
      characterCount: input.text.length,
    };
  }
}
