import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, projects } from "@/db/schema";

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
