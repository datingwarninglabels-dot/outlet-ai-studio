import { describe, expect, it } from "vitest";
import {
  estimateAssemblyCostCents,
  estimateContinuityCheckCostCents,
  estimateGenerationCostCents,
  estimateImageCostCents,
  estimateTTSCostCents,
  estimateVideoCostCents,
} from "./cost-estimate";

describe("estimateGenerationCostCents", () => {
  it("computes cents from prompt chars and assumed output tokens", () => {
    const result = estimateGenerationCostCents({
      model: "claude-sonnet-5",
      promptChars: 4000,
      assumedOutputTokens: 1000,
    });
    // 4000 chars / 4 = 1000 input tokens @ 300c/Mtok = 0.3c
    // 1000 output tokens @ 1500c/Mtok = 1.5c -> total 1.8c, rounded up to 2
    expect(result.estimatedInputTokens).toBe(1000);
    expect(result.estimatedOutputTokens).toBe(1000);
    expect(result.cents).toBe(2);
  });

  it("never returns less than 1 cent even for a tiny prompt", () => {
    const result = estimateGenerationCostCents({
      model: "claude-sonnet-5",
      promptChars: 4,
      assumedOutputTokens: 1,
    });
    expect(result.cents).toBeGreaterThanOrEqual(1);
  });

  it("throws for an unknown model rather than silently estimating zero", () => {
    expect(() =>
      estimateGenerationCostCents({ model: "not-a-real-model", promptChars: 100, assumedOutputTokens: 100 }),
    ).toThrow(/no price table entry/i);
  });
});

describe("estimateContinuityCheckCostCents", () => {
  it("returns a small positive flat estimate", () => {
    const cents = estimateContinuityCheckCostCents();
    expect(cents).toBeGreaterThanOrEqual(1);
    expect(cents).toBeLessThan(10);
  });
});

describe("estimateTTSCostCents", () => {
  it("scales with character count", () => {
    expect(estimateTTSCostCents({ provider: "elevenlabs", characterCount: 1000 })).toBe(18);
    expect(estimateTTSCostCents({ provider: "elevenlabs", characterCount: 2000 })).toBe(36);
  });

  it("rounds up fractional cents and floors at 1", () => {
    expect(estimateTTSCostCents({ provider: "elevenlabs", characterCount: 1 })).toBe(1);
  });

  it("throws for an unconfigured provider", () => {
    expect(() => estimateTTSCostCents({ provider: "nonexistent", characterCount: 100 })).toThrow();
  });
});

describe("estimateImageCostCents", () => {
  it("returns Runway's flat per-image price", () => {
    expect(estimateImageCostCents("runway")).toBe(5);
  });

  it("throws for an unconfigured provider", () => {
    expect(() => estimateImageCostCents("nonexistent")).toThrow();
  });
});

describe("estimateVideoCostCents", () => {
  it("scales linearly with duration", () => {
    expect(estimateVideoCostCents({ provider: "runway", durationSeconds: 5 })).toBe(25);
    expect(estimateVideoCostCents({ provider: "runway", durationSeconds: 10 })).toBe(50);
  });
});

describe("estimateAssemblyCostCents", () => {
  it("prorates the per-minute price by duration", () => {
    // 30c/min * (60s/60) = 30
    expect(estimateAssemblyCostCents({ provider: "shotstack", totalDurationSeconds: 60 })).toBe(30);
    // 30s -> half a minute -> 15c
    expect(estimateAssemblyCostCents({ provider: "shotstack", totalDurationSeconds: 30 })).toBe(15);
  });

  it("rounds up and floors at 1 cent for a very short video", () => {
    expect(estimateAssemblyCostCents({ provider: "shotstack", totalDurationSeconds: 1 })).toBeGreaterThanOrEqual(1);
  });
});
