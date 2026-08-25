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
