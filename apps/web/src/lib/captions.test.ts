import { describe, expect, it } from "vitest";
import { buildSrt, buildVtt } from "./captions";

const scenes = [
  { narration: "Hello world.", durationSeconds: 5 },
  { narration: "Second scene here.", durationSeconds: 3 },
  { narration: "No duration set.", durationSeconds: null },
];

describe("buildSrt", () => {
  it("numbers cues sequentially starting at 1", () => {
    const srt = buildSrt(scenes);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:05,000\nHello world.");
    expect(srt).toContain("2\n00:00:05,000 --> 00:00:08,000\nSecond scene here.");
  });

  it("accumulates timestamps cumulatively across scenes, not resetting per scene", () => {
    const srt = buildSrt(scenes);
    // third scene starts at 5 + 3 = 8s, and falls back to the 5s default duration
    expect(srt).toContain("3\n00:00:08,000 --> 00:00:13,000\nNo duration set.");
  });

  it("uses a comma as the SRT decimal separator", () => {
    const srt = buildSrt([{ narration: "x", durationSeconds: 1.5 }]);
    expect(srt).toMatch(/00:00:00,000 --> 00:00:01,500/);
  });

  it("returns an empty-ish string for an empty scene list", () => {
    expect(buildSrt([])).toBe("");
  });
});

describe("buildVtt", () => {
  it("starts with the WEBVTT header", () => {
    expect(buildVtt(scenes).startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("uses a period as the VTT decimal separator", () => {
    const vtt = buildVtt([{ narration: "x", durationSeconds: 1.5 }]);
    expect(vtt).toMatch(/00:00:00\.000 --> 00:00:01\.500/);
  });

  it("accumulates timestamps the same way as buildSrt", () => {
    const vtt = buildVtt(scenes);
    expect(vtt).toContain("00:00:05.000 --> 00:00:08.000\nSecond scene here.");
  });
});

describe("timestamp formatting edge cases", () => {
  it("rolls over minutes and hours correctly", () => {
    // 3661.25s = 1h 1m 1.25s
    const srt = buildSrt([{ narration: "long", durationSeconds: 3661.25 }]);
    expect(srt).toContain("00:00:00,000 --> 01:01:01,250");
  });
});
