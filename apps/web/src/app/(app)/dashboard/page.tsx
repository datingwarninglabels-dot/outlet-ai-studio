import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs, projects } from "@/db/schema";
import { PLATFORMS } from "@/lib/validation";

export default async function DashboardPage() {
  const session = await auth();

  const recentProjects = session?.user
    ? await db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, session.user.id))
        .orderBy(desc(projects.updatedAt))
        .limit(5)
    : [];

  const recentJobs = session?.user
    ? await db
        .select({ job: generationJobs, project: projects })
        .from(generationJobs)
        .innerJoin(projects, eq(generationJobs.projectId, projects.id))
        .where(eq(projects.ownerId, session.user.id))
        .orderBy(desc(generationJobs.updatedAt))
        .limit(5)
    : [];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">Your idea. Your voice. Your outlet.</p>
      </div>

      <section className="flex flex-col gap-3">
        <Link
          href="/create-video"
          className="flex h-11 w-fit items-center rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-5 text-sm font-medium text-black"
        >
          What do you want to create?
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Quick create</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLATFORMS.map((platform) => (
            <Link
              key={platform}
              href={`/create-video?platform=${encodeURIComponent(platform)}`}
              className="flex min-h-24 flex-col justify-between rounded-lg border border-border bg-surface p-4 hover:bg-surface-raised"
            >
              <span className="text-sm font-medium">{platform}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Recent projects</h2>
        {recentProjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            No projects yet.{" "}
            <Link href="/create-video" className="text-accent-teal">
              Start one in Create Video.
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm hover:bg-surface-raised"
                >
                  <span>{project.title}</span>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {project.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Generation jobs</h2>
        {recentJobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            No jobs yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentJobs.map(({ job, project }) => (
              <li
                key={job.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm"
              >
                <span>
                  {job.type} · {project.title}
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
        )}
      </section>
    </div>
  );
}
