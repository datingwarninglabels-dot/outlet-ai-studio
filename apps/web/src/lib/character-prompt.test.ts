import { describe, expect, it } from "vitest";
import type { characters } from "@/db/schema";
import { buildCharacterPrompt, characterAppearanceSummary } from "./character-prompt";

type Character = typeof characters.$inferSelect;

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "owner-1",
    name: "Test Character",
    description: "A curious narrator",
    face: null,
    skinTone: null,
    hair: null,
    bodyType: null,
    apparentAge: null,
    distinguishingDetails: null,
    defaultClothing: null,
    accessories: null,
    palette: null,
    negativePrompt: null,
    assignedVoiceId: null,
    isRealPerson: false,
    permissionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("characterAppearanceSummary", () => {
  it("joins only the fields that are set, in a fixed order", () => {
    const summary = characterAppearanceSummary(
      makeCharacter({ face: "round", hair: "short black", palette: "earth tones" }),
    );
    expect(summary).toBe("face: round; hair: short black; color palette: earth tones");
  });

  it("returns an empty string when no appearance fields are set", () => {
    expect(characterAppearanceSummary(makeCharacter())).toBe("");
  });

  it("includes every locked field when all are set", () => {
    const summary = characterAppearanceSummary(
      makeCharacter({
        face: "F",
        skinTone: "S",
        hair: "H",
        bodyType: "B",
        apparentAge: "A",
        distinguishingDetails: "D",
        defaultClothing: "C",
        accessories: "Ac",
        palette: "P",
      }),
    );
    expect(summary).toBe(
      "face: F; skin tone: S; hair: H; body type: B; apparent age: A; distinguishing details: D; clothing: C; accessories: Ac; color palette: P",
    );
  });
});

describe("buildCharacterPrompt", () => {
  it("falls back to the consistency_test view instruction for an unknown view type", () => {
    const known = buildCharacterPrompt(makeCharacter(), "consistency_test", false);
    const unknown = buildCharacterPrompt(makeCharacter(), "not-a-real-view", false);
    expect(unknown).toBe(known);
  });

  it("adds an identity-matching instruction only when a reference image is present", () => {
    const withRef = buildCharacterPrompt(makeCharacter(), "front", true);
    const withoutRef = buildCharacterPrompt(makeCharacter(), "front", false);
    expect(withRef).toContain("Match the identity, face, and appearance");
    expect(withoutRef).not.toContain("Match the identity");
  });

  it("says 'as described' when no appearance fields are locked", () => {
    const prompt = buildCharacterPrompt(makeCharacter(), "front", false);
    expect(prompt).toContain("Appearance: as described");
  });

  it("includes the character's free-text description", () => {
    const prompt = buildCharacterPrompt(makeCharacter({ description: "A grumpy lighthouse keeper" }), "front", false);
    expect(prompt).toContain("Character: A grumpy lighthouse keeper.");
  });
});
