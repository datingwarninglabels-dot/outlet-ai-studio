"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects } from "@/db/schema";
import { estimateGenerationCostCents } from "@/lib/cost-estimate";
import { requestJob } from "@/lib/jobs";
import { scriptProvider } from "@/lib/providers";
import { createVideoSchema } from "@/lib/validation";

const SCRIPT_MODEL = "claude-sonnet-5";
const ASSUMED_OUTPUT_TOKENS = 700;

/**
 * Creates the project and a generation_job awaiting cost confirmation, then
 * redirects to the project page where the Owner confirms or cancels before
 * anything is actually generated. Guards against a double-submit creating a
 * second project: if a job already exists for this idempotency key, reuse
 * its project instead of making a new one. This is a best-effort guard (a
 * SELECT-then-INSERT, not a DB constraint spanning both tables) — adequate
 * for a single-Owner app's double-click/retry case, not built for real
 * concurrent duplicate requests.
 */
export async function requestScript(
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

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Missing request key — reload the page and try again." };
  }

  if (!scriptProvider.isConfigured()) {
    return {
      error:
        "Script generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app.",
    };
  }

  const [existingJob] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existingJob) {
    redirect(`/projects/${existingJob.projectId}`);
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

  const estimate = estimateGenerationCostCents({
    model: SCRIPT_MODEL,
    promptChars: parsed.data.idea.length + 500,
    assumedOutputTokens: ASSUMED_OUTPUT_TOKENS,
  });

  try {
    await requestJob({
      ownerId: session.user.id,
      projectId: project.id,
      type: "script",
      provider: scriptProvider.name,
      model: SCRIPT_MODEL,
      idempotencyKey,
      params: parsed.data,
      estimatedCostCents: estimate.cents,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

  redirect(`/projects/${project.id}`);
}
