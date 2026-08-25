import { describe, expect, it } from "vitest";
import type { worlds } from "@/db/schema";
import { buildWorldPrompt, worldSettingSummary } from "./world-prompt";

type World = typeof worlds.$inferSelect;

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    ownerId: "owner-1",
    name: "Test World",
    description: "A neon-lit rooftop at night",
    locationDescription: null,
    propsVehicles: null,
    outfitsAccessories: null,
    lightingPalette: null,
    cameraStyle: null,
    animationStyle: null,
    timeOfDay: null,
    weather: null,
    negativePrompt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("worldSettingSummary", () => {
  it("joins only the fields that are set, in a fixed order", () => {
    const summary = worldSettingSummary(
      makeWorld({ locationDescription: "rooftop", weather: "rain" }),
    );
    expect(summary).toBe("location: rooftop; weather: rain");
  });

  it("returns an empty string when no setting fields are set", () => {
    expect(worldSettingSummary(makeWorld())).toBe("");
  });
});

describe("buildWorldPrompt", () => {
  it("falls back to the consistency_test view instruction for an unknown view type", () => {
    const known = buildWorldPrompt(makeWorld(), "consistency_test", false);
    const unknown = buildWorldPrompt(makeWorld(), "does-not-exist", false);
    expect(unknown).toBe(known);
  });

  it("adds a setting-matching instruction only when a reference image is present", () => {
    const withRef = buildWorldPrompt(makeWorld(), "establishing", true);
    const withoutRef = buildWorldPrompt(makeWorld(), "establishing", false);
    expect(withRef).toContain("Match the location, lighting, and style");
    expect(withoutRef).not.toContain("Match the location");
  });

  it("always excludes people/characters from the environment-only shot", () => {
    const prompt = buildWorldPrompt(makeWorld(), "detail", false);
    expect(prompt).toContain("No people or characters in frame");
  });

  it("says 'as described' when no setting fields are locked", () => {
    expect(buildWorldPrompt(makeWorld(), "establishing", false)).toContain("Details: as described");
  });
});
