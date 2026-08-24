"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects, scripts } from "@/db/schema";
import { scriptProvider } from "@/lib/providers";
import { createVideoSchema } from "@/lib/validation";

export async function generateScript(
  _prev: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = createVideoSchema.safeParse({
    idea: formData.get("idea"),
    platform: formData.get("platform"),
    mode: formData.get("mode"),
  });

  if (!parsed.success) {
    return { error: "Please enter an idea (3–2000 characters) and pick a platform and mode." };
  }

  if (!scriptProvider.isConfigured()) {
    return {
      error:
        "Script generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app.",
    };
  }

  const [project] = await db
    .insert(projects)
    .values({
      ownerId: session.user.id,
      title: parsed.data.idea.slice(0, 80),
      platform: parsed.data.platform,
      status: "draft",
    })
    .returning();

  const [job] = await db
    .insert(generationJobs)
    .values({
      projectId: project.id,
      type: "script",
      provider: scriptProvider.name,
      status: "running",
      params: parsed.data,
    })
    .returning();

  try {
    const result = await scriptProvider.generate(parsed.data);

    await db.insert(scripts).values({
      projectId: project.id,
      content: result.content,
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      status: "draft",
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

    return { error: "Script generation failed. Open the project to see the job error." };
  }

  redirect(`/projects/${project.id}`);
}
