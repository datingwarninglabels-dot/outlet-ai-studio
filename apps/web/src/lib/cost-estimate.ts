// Approximate. Anthropic's published per-token pricing changes over time —
// verify against console.anthropic.com/settings/billing before trusting
// this for real spend decisions. It's shown to the Owner as an estimate,
// never as a guaranteed final cost.
const MODEL_PRICE_CENTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 300, output: 1500 },
};

const CHARS_PER_TOKEN = 4;

export type CostEstimate = {
  cents: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function estimateGenerationCostCents(input: {
  model: string;
  promptChars: number;
  assumedOutputTokens: number;
}): CostEstimate {
  const price = MODEL_PRICE_CENTS_PER_MTOK[input.model];
  if (!price) {
    throw new Error(`No price table entry for model "${input.model}" — add one before estimating cost.`);
  }

  const estimatedInputTokens = estimateTokensFromChars(input.promptChars);
  const estimatedOutputTokens = input.assumedOutputTokens;

  const cents =
    (estimatedInputTokens / 1_000_000) * price.input +
    (estimatedOutputTokens / 1_000_000) * price.output;

  return {
    // Round up — an estimate that undersells cost is worse than one that overstates it slightly.
    cents: Math.max(1, Math.ceil(cents)),
    estimatedInputTokens,
    estimatedOutputTokens,
  };
}

// Approximate — verify against elevenlabs.io/pricing before trusting this
// for real spend decisions.
const TTS_PRICE_CENTS_PER_1K_CHARS: Record<string, number> = {
  elevenlabs: 18,
};

export function estimateTTSCostCents(input: { provider: string; characterCount: number }): number {
  const pricePerThousand = TTS_PRICE_CENTS_PER_1K_CHARS[input.provider];
  if (pricePerThousand === undefined) {
    throw new Error(`No price table entry for TTS provider "${input.provider}" — add one before estimating cost.`);
  }

  return Math.max(1, Math.ceil((input.characterCount / 1000) * pricePerThousand));
}

// Confirmed against docs.dev.runwayml.com/guides/pricing (2026-08): gen4_image
// is 5 credits per 720p image at $0.01/credit = 5 cents flat. Re-check if
// Runway changes their credit pricing.
const IMAGE_PRICE_CENTS_PER_GENERATION: Record<string, number> = {
  runway: 5,
};

export function estimateImageCostCents(provider: string): number {
  const price = IMAGE_PRICE_CENTS_PER_GENERATION[provider];
  if (price === undefined) {
    throw new Error(`No price table entry for image provider "${provider}" — add one before estimating cost.`);
  }
  return price;
}

// Confirmed against docs.dev.runwayml.com/guides/pricing (2026-08): gen4_turbo
// is 5 credits/second ($0.05/sec). Re-check if Runway changes their pricing
// or if the video provider's model constant changes.
const VIDEO_PRICE_CENTS_PER_SECOND: Record<string, number> = {
  runway: 5,
};

export function estimateVideoCostCents(input: { provider: string; durationSeconds: number }): number {
  const pricePerSecond = VIDEO_PRICE_CENTS_PER_SECOND[input.provider];
  if (pricePerSecond === undefined) {
    throw new Error(`No price table entry for video provider "${input.provider}" — add one before estimating cost.`);
  }
  return input.durationSeconds * pricePerSecond;
}
