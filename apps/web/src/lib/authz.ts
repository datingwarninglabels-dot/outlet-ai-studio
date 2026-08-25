import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

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
