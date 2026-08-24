import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects, scripts } from "@/db/schema";

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
        Storyboard, voice, visuals, and export aren&apos;t wired up yet — this page only shows what
        Create Video has produced so far.
      </p>
    </div>
  );
}
