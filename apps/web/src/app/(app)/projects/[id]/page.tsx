import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, scenes, scripts, usageCosts } from "@/db/schema";
import { isStalled } from "@/lib/jobs";
import { storyboardProvider } from "@/lib/providers";
import { loadOwnedProject } from "@/lib/authz";
import {
  cancelScript,
  cancelStoryboard,
  confirmScript,
  confirmStoryboard,
  moveScene,
  requestStoryboard,
  retryScript,
  retryStoryboard,
  updateScene,
} from "./actions";
import { JobConfirmCard, StalledJobCard } from "./job-cards";
import { GenerateStoryboardForm, SceneEditForm } from "./scene-form";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  let project;
  try {
    project = await loadOwnedProject(id, session.user.id);
  } catch {
    notFound();
  }

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, project.id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(asc(scenes.order));

  const jobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.projectId, project.id))
    .orderBy(desc(generationJobs.createdAt));

  const scriptJob = jobs.find((job) => job.type === "script");
  const storyboardJob = jobs.find((job) => job.type === "storyboard");

  const [scriptCost] = scriptJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, scriptJob.id)).limit(1)
    : [];
  const [storyboardCost] = storyboardJob
    ? await db.select().from(usageCosts).where(eq(usageCosts.jobId, storyboardJob.id)).limit(1)
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {project.platform} · {project.status}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Script</h2>
        {scriptJob?.status === "awaiting_confirmation" && scriptCost && (
          <JobConfirmCard
            jobId={scriptJob.id}
            estimatedCostCents={scriptCost.estimatedCostCents}
            provider={scriptJob.provider}
            model={scriptJob.model}
            label="script generation"
            confirmAction={confirmScript}
            cancelAction={cancelScript}
          />
        )}
        {scriptJob?.status === "running" && isStalled(scriptJob) && (
          <StalledJobCard jobId={scriptJob.id} label="Script generation" retryAction={retryScript} />
        )}
        {scriptJob?.status === "failed" && (
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Script generation failed: {scriptJob.error}. Start a new project from Create Video to try
            again.
          </p>
        )}
        {scriptJob?.status === "cancelled" && (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Script generation was cancelled before it started — no cost was incurred.
          </p>
        )}
        {script ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm">{script.content}</p>
            <p className="mt-4 text-xs text-muted">
              {script.provider}/{script.model} · {script.promptTokens ?? "?"} in /{" "}
              {script.completionTokens ?? "?"} out tokens
            </p>
          </div>
        ) : (
          !scriptJob && (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              No script generated yet.
            </p>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Storyboard</h2>

        {storyboardJob?.status === "awaiting_confirmation" && storyboardCost && (
          <JobConfirmCard
            jobId={storyboardJob.id}
            estimatedCostCents={storyboardCost.estimatedCostCents}
            provider={storyboardJob.provider}
            model={storyboardJob.model}
            label="storyboard generation"
            confirmAction={confirmStoryboard}
            cancelAction={cancelStoryboard}
          />
        )}
        {storyboardJob?.status === "running" && isStalled(storyboardJob) && (
          <StalledJobCard
            jobId={storyboardJob.id}
            label="Storyboard generation"
            retryAction={retryStoryboard}
          />
        )}
        {storyboardJob?.status === "failed" && (
          <p className="rounded-lg border border-dashed border-red-400/40 p-6 text-sm text-red-400">
            Storyboard generation failed: {storyboardJob.error}
          </p>
        )}

        {projectScenes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {projectScenes.map((scene, index) => (
              <SceneEditForm
                key={scene.id}
                projectId={project.id}
                scene={{
                  id: scene.id,
                  narration: scene.narration,
                  visualDescription: scene.visualDescription,
                  audioDirection: scene.audioDirection ?? "",
                  durationSeconds: scene.durationSeconds,
                  provider: scene.provider,
                  model: scene.model,
                  version: scene.version,
                }}
                index={index}
                sceneCount={projectScenes.length}
                updateAction={updateScene}
                moveAction={moveScene}
              />
            ))}
            <p className="text-xs text-muted">
              Total estimated runtime:{" "}
              {projectScenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)}s across{" "}
              {projectScenes.length} scene{projectScenes.length === 1 ? "" : "s"}.
            </p>
          </div>
        ) : (
          (!storyboardJob ||
            storyboardJob.status === "failed" ||
            storyboardJob.status === "cancelled") && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
              <p className="text-sm text-muted">
                {storyboardJob
                  ? "Try again — this creates a new generation request."
                  : "No storyboard yet. This breaks the script into a scene list — narration, a visual description, audio direction, and an estimated duration per scene — that you can edit and reorder before voice or visuals are generated from it."}
              </p>
              <GenerateStoryboardForm
                projectId={project.id}
                disabledReason={
                  !script
                    ? "Generate a script first — the storyboard is built from it."
                    : !storyboardProvider.isConfigured()
                      ? "Storyboard generation isn't connected yet — add ANTHROPIC_API_KEY to your environment and restart the app."
                      : null
                }
                requestAction={requestStoryboard}
              />
            </div>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Generation jobs</h2>
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <span>
                {job.type} · {job.provider}
              </span>
              <span
                className={
                  job.status === "failed"
                    ? "text-red-400"
                    : job.status === "succeeded"
                      ? "text-accent-teal"
                      : "text-muted"
                }
              >
                {job.status}
              </span>
            </li>
          ))}
        </ul>
        {jobs.some((job) => job.status === "failed" && job.error) && (
          <p className="text-xs text-red-400">{jobs.find((job) => job.status === "failed")?.error}</p>
        )}
      </section>

      <p className="text-xs text-muted">
        Voice, visuals, and export aren&apos;t wired up yet — this page shows what Create Video and
        the storyboard step have produced so far.
      </p>
    </div>
  );
}
