import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, mediaAssets, projects, worlds } from "@/db/schema";

export async function loadOwnedProject(projectId: string, ownerId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);

  if (!project) {
    throw new Error("Project not found.");
  }

  return project;
}

export async function loadOwnedCharacter(characterId: string, ownerId: string) {
  const [character] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(1);

  if (!character) {
    throw new Error("Character not found.");
  }

  return character;
}

export async function loadOwnedWorld(worldId: string, ownerId: string) {
  const [world] = await db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), eq(worlds.ownerId, ownerId)))
    .limit(1);

  if (!world) {
    throw new Error("World not found.");
  }

  return world;
}

export async function loadOwnedMediaAsset(mediaAssetId: string, ownerId: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.ownerId, ownerId)))
    .limit(1);

  if (!asset) {
    throw new Error("Media asset not found.");
  }

  return asset;
}
