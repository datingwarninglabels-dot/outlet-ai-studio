import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";

export default async function ProjectsPage() {
  const session = await auth();
  const ownedProjects = session?.user
    ? await db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, session.user.id))
        .orderBy(desc(projects.updatedAt))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-muted">
          Editing, autosave, and resume are still limited — this is a read-only list of what
          Create Video has produced so far.
        </p>
      </div>

      {ownedProjects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
          No projects yet.{" "}
          <Link href="/create-video" className="text-accent-teal">
            Start one in Create Video.
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedProjects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm hover:bg-surface-raised"
              >
                <span>{project.title}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{project.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
