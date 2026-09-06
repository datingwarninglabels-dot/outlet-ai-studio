import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { relativeTime } from "@/lib/format";

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
      <PageHeader
        title="Projects"
        description="Every video you've started. Open one to continue where you left off — script, storyboard, voice, visuals, and export all live on the project page."
        actions={ownedProjects.length > 0 ? <Button href="/create-video">Create a video</Button> : undefined}
      />

      {ownedProjects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Start with an idea and Outlet AI Studio writes the script — then you continue from there."
          action={<Button href="/create-video">Create your first video</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedProjects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition-colors hover:border-border-strong hover:bg-surface-raised"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{project.title}</span>
                  <span className="text-xs text-muted">
                    {project.platform ? `${project.platform} · ` : ""}Updated {relativeTime(project.updatedAt)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
