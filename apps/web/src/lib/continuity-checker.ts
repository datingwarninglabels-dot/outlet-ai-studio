import Anthropic from "@anthropic-ai/sdk";

// Section 11: "compares planned and generated scenes and warns about
// unexpected changes to faces, hair, clothing, props, locations, lighting,
// voice, or other locked details." Implemented as a single Claude vision
// call — Anthropic's Messages API image support is well-established, stable
// functionality (unlike Runway/Shotstack, this wasn't verified against
// fresh docs, consistent with how the other Anthropic-backed providers in
// this app are treated). Best-effort: a failed or misconfigured check must
// never invalidate an otherwise-successful visual generation — callers are
// expected to wrap this in a try/catch and treat it as optional QA.
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a continuity checker for an AI video generation pipeline. You are shown
a generated image and a list of locked appearance/setting details it was supposed to follow. Report
ONLY details that clearly and visibly contradict the locked list (wrong hair color, wrong clothing,
wrong location type, missing a required prop, etc.) — do not flag stylistic variation, camera angle,
pose, or anything not explicitly in the locked list. Respond with strict JSON only, no other text:
{"warnings": [{"field": "short field name", "note": "one sentence describing the mismatch"}]}.
Return {"warnings": []} if everything matches or nothing locked is visibly checkable.`;

export type ContinuityWarning = { field: string; note: string };

export type ContinuityCheckResult = {
  warnings: ContinuityWarning[];
  provider: string;
  model: string;
};

export function isContinuityCheckerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseWarnings(text: string): ContinuityWarning[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      "warnings" in parsed &&
      Array.isArray((parsed as { warnings: unknown }).warnings)
    ) {
      return (parsed as { warnings: unknown[] }).warnings.filter(
        (w): w is ContinuityWarning =>
          typeof w === "object" &&
          w !== null &&
          typeof (w as Record<string, unknown>).field === "string" &&
          typeof (w as Record<string, unknown>).note === "string",
      );
    }
  } catch {
    // The model didn't return valid JSON — treat as "nothing structured to
    // report" rather than failing the whole visual generation over a QA step.
  }
  return [];
}

export async function runContinuityCheck(input: {
  imageBytes: Buffer;
  contentType: string;
  lockedDetails: string;
}): Promise<ContinuityCheckResult> {
  if (!isContinuityCheckerConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mediaType = input.contentType.includes("png") ? "image/png" : "image/jpeg";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: input.imageBytes.toString("base64") },
          },
          { type: "text", text: `Locked details this image must match:\n${input.lockedDetails}` },
        ],
      },
    ],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return { warnings: parseWarnings(text), provider: "anthropic", model: MODEL };
}
