import { describe, expect, it } from "vitest";
import { derivePipeline, type PipelineInput } from "./pipeline";

const EMPTY: PipelineInput = {
  hasScript: false,
  sceneCount: 0,
  hasVoice: false,
  scenesWithVisual: 0,
  scenesWithAnimation: 0,
  hasFinalVideo: false,
  thumbnailCount: 0,
  jobByType: {},
};

function stateOf(input: PipelineInput, id: string) {
  return derivePipeline(input).find((s) => s.id === id)!.state;
}

describe("derivePipeline", () => {
  it("on a brand-new project: script is ready, everything downstream is locked", () => {
    const steps = derivePipeline(EMPTY);
    expect(stateOf(EMPTY, "script")).toBe("ready");
    expect(stateOf(EMPTY, "storyboard")).toBe("locked");
    expect(stateOf(EMPTY, "voice")).toBe("locked");
    expect(steps.find((s) => s.id === "storyboard")!.lockedReason).toMatch(/script/i);
    // thumbnails don't depend on the linear pipeline
    expect(stateOf(EMPTY, "thumbnail")).toBe("ready");
  });

  it("unlocks storyboard once a script exists", () => {
    const input = { ...EMPTY, hasScript: true };
    expect(stateOf(input, "script")).toBe("done");
    expect(stateOf(input, "storyboard")).toBe("ready");
  });

  it("marks visuals done only when every scene has one", () => {
    const partial = { ...EMPTY, hasScript: true, sceneCount: 3, scenesWithVisual: 2 };
    expect(stateOf(partial, "visual")).toBe("ready");
    const complete = { ...partial, scenesWithVisual: 3 };
    expect(stateOf(complete, "visual")).toBe("done");
  });

  it("reflects an in-flight job's status over the derived readiness", () => {
    const input = { ...EMPTY, hasScript: true, jobByType: { storyboard: { type: "storyboard", status: "running" } } };
    expect(stateOf(input, "storyboard")).toBe("running");
    const awaiting = { ...input, jobByType: { storyboard: { type: "storyboard", status: "awaiting_confirmation" } } };
    expect(stateOf(awaiting, "storyboard")).toBe("awaiting_confirmation");
    const failed = { ...input, jobByType: { storyboard: { type: "storyboard", status: "failed" } } };
    expect(stateOf(failed, "storyboard")).toBe("failed");
  });

  it("gates assembly on both voice and full visual coverage", () => {
    const base = { ...EMPTY, hasScript: true, sceneCount: 2, scenesWithVisual: 2 };
    expect(stateOf(base, "assembly")).toBe("locked");
    expect(stateOf({ ...base, hasVoice: true }, "assembly")).toBe("ready");
  });

  it("always returns the seven steps in pipeline order", () => {
    expect(derivePipeline(EMPTY).map((s) => s.id)).toEqual([
      "script",
      "storyboard",
      "voice",
      "visual",
      "animation",
      "assembly",
      "thumbnail",
    ]);
  });
});
