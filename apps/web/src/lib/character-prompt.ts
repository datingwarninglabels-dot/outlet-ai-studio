import type { characters } from "@/db/schema";

type Character = typeof characters.$inferSelect;

const VIEW_INSTRUCTIONS: Record<string, string> = {
  front: "front-facing, direct eye contact, head and shoulders",
  side: "side profile view, head and shoulders",
  close_up: "close-up portrait, facial detail sharply visible",
  full_body: "full body, standing, neutral pose, plain background",
  consistency_test: "front-facing head-and-shoulders portrait, neutral expression",
};

// Reused both when generating character-sheet views and when composing a
// per-scene visual prompt (Section 11 continuity wiring) — and as the
// locked-details text the Continuity Checker compares a generated image
// against, so it stays in sync with whatever the prompt actually asked for.
export function characterAppearanceSummary(character: Character): string {
  return [
    character.face && `face: ${character.face}`,
    character.skinTone && `skin tone: ${character.skinTone}`,
    character.hair && `hair: ${character.hair}`,
    character.bodyType && `body type: ${character.bodyType}`,
    character.apparentAge && `apparent age: ${character.apparentAge}`,
    character.distinguishingDetails && `distinguishing details: ${character.distinguishingDetails}`,
    character.defaultClothing && `clothing: ${character.defaultClothing}`,
    character.accessories && `accessories: ${character.accessories}`,
    character.palette && `color palette: ${character.palette}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildCharacterPrompt(character: Character, viewType: string, hasReference: boolean): string {
  const appearance = characterAppearanceSummary(character);

  const referenceNote = hasReference
    ? "Match the identity, face, and appearance of the person tagged IDENTITY in the reference image exactly. "
    : "";

  const viewInstruction = VIEW_INSTRUCTIONS[viewType] ?? VIEW_INSTRUCTIONS.consistency_test;

  return `${referenceNote}Character: ${character.description}. Appearance: ${
    appearance || "as described"
  }. Shot: ${viewInstruction}. Photorealistic, consistent character design, plain neutral background.`;
}
