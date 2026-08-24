"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects, scenes, scripts } from "@/db/schema";
import { storyboardProvider } from "@/lib/providers";
import { sceneUpdateSchema } from "@/lib/validation";

async function loadOwnedProject(projectId: string) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id)))
    .limit(1);

  if (!project) {
    throw new Error("Project not found.");
  }

  return project;
}

export async function generateStoryboard(
  _prev: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId);

  if (!storyboardProvider.isConfigured()) {
    return {
      error:
        "Storyboard generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app.",
    };
  }

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, project.id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  if (!script) {
    return { error: "Generate a script first — the storyboard is built from it." };
  }

  const [job] = await db
    .insert(generationJobs)
    .values({
      projectId: project.id,
      type: "storyboard",
      provider: storyboardProvider.name,
      status: "running",
      params: { platform: project.platform },
    })
    .returning();

  try {
    const result = await storyboardProvider.generate({
      script: script.content,
      platform: project.platform ?? "Custom Project",
    });

    const scene = result.scenes[0];
    if (!scene) {
      throw new Error("Storyboard provider returned no scenes.");
    }

    await db.insert(scenes).values({
      projectId: project.id,
      order: 0,
      narration: scene.narration,
      visualDescription: scene.visualDescription,
      durationSeconds: scene.durationSeconds,
      status: "draft",
      provider: result.provider,
      model: result.model,
    });

    await db
      .update(generationJobs)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(eq(generationJobs.id, job.id));
  } catch (err) {
    await db
      .update(generationJobs)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));

    return { error: "Storyboard generation failed. See the job error below." };
  }

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}

export async function updateScene(
  _prev: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const projectId = String(formData.get("projectId") ?? "");
  const project = await loadOwnedProject(projectId);

  const parsed = sceneUpdateSchema.safeParse({
    sceneId: formData.get("sceneId"),
    narration: formData.get("narration"),
    visualDescription: formData.get("visualDescription"),
    durationSeconds: formData.get("durationSeconds"),
  });

  if (!parsed.success) {
    return { error: "Check the scene fields — narration, visual description, and duration are required." };
  }

  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.id, parsed.data.sceneId), eq(scenes.projectId, project.id)))
    .limit(1);

  if (!scene) {
    return { error: "Scene not found." };
  }

  await db
    .update(scenes)
    .set({
      narration: parsed.data.narration,
      visualDescription: parsed.data.visualDescription,
      durationSeconds: parsed.data.durationSeconds,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, scene.id));

  revalidatePath(`/projects/${project.id}`);
  return { error: "" };
}
