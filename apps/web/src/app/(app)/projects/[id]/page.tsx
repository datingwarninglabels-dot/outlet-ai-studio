import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects, scenes, scripts } from "@/db/schema";
import { storyboardProvider } from "@/lib/providers";
import { GenerateStoryboardForm, SceneEditForm } from "./scene-form";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, session.user.id)))
    .limit(1);

  if (!project) {
    notFound();
  }

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, project.id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  const [scene] = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, project.id))
    .orderBy(desc(scenes.createdAt))
    .limit(1);

  const jobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.projectId, project.id))
    .orderBy(desc(generationJobs.createdAt));

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
        {script ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm">{script.content}</p>
            <p className="mt-4 text-xs text-muted">
              {script.provider}/{script.model} · {script.promptTokens ?? "?"} in /{" "}
              {script.completionTokens ?? "?"} out tokens
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            No script generated yet.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Storyboard</h2>
        {scene ? (
          <SceneEditForm
            projectId={project.id}
            scene={{
              id: scene.id,
              narration: scene.narration,
              visualDescription: scene.visualDescription,
              durationSeconds: scene.durationSeconds,
              provider: scene.provider,
              model: scene.model,
            }}
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
            <p className="text-sm text-muted">
              No storyboard yet. This turns the script into a single scene — narration, a visual
              description, and an estimated duration — that you can edit before voice or visuals are
              generated from it.
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
            />
          </div>
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
          <p className="text-xs text-red-400">
            {jobs.find((job) => job.status === "failed")?.error}
          </p>
        )}
      </section>

      <p className="text-xs text-muted">
        Voice, visuals, and export aren&apos;t wired up yet — this page shows what Create Video and
        the storyboard step have produced so far.
      </p>
    </div>
  );
}
