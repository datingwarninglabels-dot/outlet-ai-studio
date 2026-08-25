import { describe, expect, it } from "vitest";
import { isValidSceneEntry, normalizeScene, parseScenes, recoverTruncatedArray } from "./anthropic-storyboard-provider";

describe("recoverTruncatedArray (M4 long-form truncation recovery)", () => {
  it("recovers the two complete scenes and drops a partial third", () => {
    const raw = `[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"d","visualDescription":"e","audioDirection":"f","durationSeconds":6},{"narration":"partial start, cut off he`;
    const result = recoverTruncatedArray(raw);
    expect(result).toHaveLength(2);
    expect(result?.[0].narration).toBe("a");
    expect(result?.[1].narration).toBe("d");
  });

  it("is string-aware: a literal brace inside narration text doesn't throw off depth tracking", () => {
    const raw = `[{"narration":"say { without a close","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"second complete one","visualDescription":"e","audioDirection":"f","durationSeconds":6},{"narration":"cut off th`;
    const result = recoverTruncatedArray(raw);
    expect(result).toHaveLength(2);
    expect(result?.[0].narration).toBe("say { without a close");
    expect(result?.[1].narration).toBe("second complete one");
  });

  it("respects escaped quotes inside a string without ending string-tracking early", () => {
    const raw = `[{"narration":"she said \\"hi\\" then {left}","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"cut off h`;
    const result = recoverTruncatedArray(raw);
    expect(result).toHaveLength(1);
    expect(result?.[0].narration).toBe('she said "hi" then {left}');
  });

  it("still parses a fully valid (non-truncated) array", () => {
    const raw = `[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5}]`;
    expect(recoverTruncatedArray(raw)).toHaveLength(1);
  });

  it("returns null when there isn't even one complete scene object", () => {
    const raw = `[{"narration":"incomplete, no closing brace at all`;
    expect(recoverTruncatedArray(raw)).toBeNull();
  });

  it("returns null when there's no array at all", () => {
    expect(recoverTruncatedArray("not json")).toBeNull();
  });

  it("tolerates preamble text before the array", () => {
    const raw = `Here is the output:\n[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"cut`;
    const result = recoverTruncatedArray(raw);
    expect(result).toHaveLength(1);
  });
});

describe("parseScenes", () => {
  const validArray = `[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5.7}]`;

  it("parses a valid array without needing recovery", () => {
    const { scenes, truncated } = parseScenes(validArray, false);
    expect(truncated).toBe(false);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].durationSeconds).toBe(6); // rounded via normalizeScene
  });

  it("falls back to recovery only when the model actually hit its token limit", () => {
    const truncatedRaw = `[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"cut off`;
    // hitTokenLimit=false: don't attempt recovery, just throw — a malformed
    // response for a reason OTHER than truncation shouldn't be silently
    // "recovered" into a partial result.
    expect(() => parseScenes(truncatedRaw, false)).toThrow();
  });

  it("recovers a partial scene list when the model hit its token limit", () => {
    const truncatedRaw = `[{"narration":"a","visualDescription":"b","audioDirection":"c","durationSeconds":5},{"narration":"cut off`;
    const { scenes, truncated } = parseScenes(truncatedRaw, true);
    expect(truncated).toBe(true);
    expect(scenes).toHaveLength(1);
  });

  it("throws when even recovery can't find a complete scene", () => {
    expect(() => parseScenes("garbage, not json at all", true)).toThrow();
  });

  it("rejects a well-formed JSON array whose entries don't match the scene shape", () => {
    expect(() => parseScenes(`[{"foo": "bar"}]`, false)).toThrow();
  });
});

describe("isValidSceneEntry", () => {
  it("accepts an object with all four required string/number fields", () => {
    expect(
      isValidSceneEntry({ narration: "a", visualDescription: "b", audioDirection: "c", durationSeconds: 5 }),
    ).toBe(true);
  });

  it("rejects an object missing a required field", () => {
    expect(isValidSceneEntry({ narration: "a", visualDescription: "b", audioDirection: "c" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidSceneEntry("a string")).toBe(false);
    expect(isValidSceneEntry(null)).toBe(false);
    expect(isValidSceneEntry(42)).toBe(false);
  });
});

describe("normalizeScene", () => {
  it("rounds durationSeconds to the nearest whole second", () => {
    expect(
      normalizeScene({ narration: "a", visualDescription: "b", audioDirection: "c", durationSeconds: 5.4 })
        .durationSeconds,
    ).toBe(5);
    expect(
      normalizeScene({ narration: "a", visualDescription: "b", audioDirection: "c", durationSeconds: 5.6 })
        .durationSeconds,
    ).toBe(6);
  });

  it("floors durationSeconds at 1 even if the model returned 0 or negative", () => {
    expect(
      normalizeScene({ narration: "a", visualDescription: "b", audioDirection: "c", durationSeconds: 0 })
        .durationSeconds,
    ).toBe(1);
    expect(
      normalizeScene({ narration: "a", visualDescription: "b", audioDirection: "c", durationSeconds: -3 })
        .durationSeconds,
    ).toBe(1);
  });
});
