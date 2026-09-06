import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { generationJobs, projects } from "@/db/schema";
import { EXAMPLE_IDEAS } from "@/lib/create-examples";
import { relativeTime } from "@/lib/format";
import { jobStatusLabel, jobStatusTone, jobTypeLabel } from "@/lib/labels";
import { PLATFORMS } from "@/lib/validation";

const GETTING_STARTED = [
  { title: "Describe your idea", body: "One or two sentences — topic, length, and tone. Outlet AI Studio writes the script." },
  { title: "Review script & storyboard", body: "Edit the script, then break it into an editable scene-by-scene storyboard." },
  { title: "Voice, visuals & export", body: "Generate narration and per-scene visuals, assemble the final video, and download the package." },
];

function PlatformGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await auth();

  const [recentProjects, recentJobs] = session?.user
    ? await Promise.all([
        db
          .select()
          .from(projects)
          .where(eq(projects.ownerId, session.user.id))
          .orderBy(desc(projects.updatedAt))
          .limit(5),
        db
          .select({ job: generationJobs, project: projects })
          .from(generationJobs)
          .innerJoin(projects, eq(generationJobs.projectId, projects.id))
          .where(eq(projects.ownerId, session.user.id))
          .orderBy(desc(generationJobs.updatedAt))
          .limit(5),
      ])
    : [[], []];

  const firstRun = recentProjects.length === 0 && recentJobs.length === 0;
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={firstRun ? "Welcome to Outlet AI Studio" : `Welcome back${firstName ? `, ${firstName}` : ""}`}
        description={firstRun ? "One idea in, a full content package out. Here's how it works." : "Your idea. Your voice. Your outlet."}
        actions={!firstRun ? <Button href="/create-video">Create a video</Button> : undefined}
      />

      {firstRun ? (
        <>
          <ol className="grid gap-4 sm:grid-cols-3">
            {GETTING_STARTED.map((step, i) => (
              <li key={step.title}>
                <Card className="flex h-full flex-col gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-xs font-semibold text-muted">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-sm text-muted">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm font-medium text-foreground">Ready when you are</p>
            <p className="text-sm text-muted">
              Start from scratch, or try one of these to see the whole flow:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button href="/create-video">Create your first video</Button>
              {EXAMPLE_IDEAS.slice(0, 2).map((idea) => (
                <Button key={idea} href={`/create-video?idea=${encodeURIComponent(idea)}`} variant="secondary" size="sm">
                  {idea.split(",")[0].replace(/^A /, "").slice(0, 34)}…
                </Button>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">Quick create</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((platform) => (
              <Link
                key={platform}
                href={`/create-video?platform=${encodeURIComponent(platform)}`}
                className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
              >
                <PlatformGlyph />
                <span className="text-sm font-medium text-foreground">
                  New {platform === "Custom Project" ? "project" : `${platform} video`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!firstRun && (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Recent projects</h2>
              <Link href="/projects" className="text-sm text-accent hover:underline">
                All projects
              </Link>
            </div>
            {recentProjects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                action={<Button href="/create-video">Create a video</Button>}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition-colors hover:border-border-strong hover:bg-surface-raised"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{project.title}</span>
                        <span className="text-xs text-muted">Updated {relativeTime(project.updatedAt)}</span>
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recentJobs.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-muted">Recent generation jobs</h2>
              <ul className="flex flex-col gap-2">
                {recentJobs.map(({ job, project }) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-foreground">
                        {jobTypeLabel(job.type)} · {project.title}
                      </span>
                      <span className="text-xs text-muted">{relativeTime(job.updatedAt)}</span>
                    </span>
                    <Badge tone={jobStatusTone(job.status)} dot>
                      {jobStatusLabel(job.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
