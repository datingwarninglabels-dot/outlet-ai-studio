import type { worlds } from "@/db/schema";

type World = typeof worlds.$inferSelect;

const VIEW_INSTRUCTIONS: Record<string, string> = {
  establishing: "wide establishing shot of the full location, showing scale and layout",
  detail: "close detail shot, emphasizing texture, props, and lighting quality",
  consistency_test: "medium establishing shot, neutral framing",
};

export function buildWorldPrompt(world: World, viewType: string, hasReference: boolean): string {
  const setting = [
    world.locationDescription && `location: ${world.locationDescription}`,
    world.propsVehicles && `props/vehicles: ${world.propsVehicles}`,
    world.outfitsAccessories && `typical outfits/accessories: ${world.outfitsAccessories}`,
    world.lightingPalette && `lighting/color palette: ${world.lightingPalette}`,
    world.cameraStyle && `camera/lens style: ${world.cameraStyle}`,
    world.animationStyle && `animation/realism style: ${world.animationStyle}`,
    world.timeOfDay && `time of day: ${world.timeOfDay}`,
    world.weather && `weather: ${world.weather}`,
  ]
    .filter(Boolean)
    .join("; ");

  const referenceNote = hasReference
    ? "Match the location, lighting, and style of the reference image tagged SETTING exactly. "
    : "";

  const viewInstruction = VIEW_INSTRUCTIONS[viewType] ?? VIEW_INSTRUCTIONS.consistency_test;

  return `${referenceNote}Setting: ${world.description}. Details: ${
    setting || "as described"
  }. Shot: ${viewInstruction}. No people or characters in frame — environment only, consistent world design.`;
}
