import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const QUICK_CREATE = [
  "TikTok",
  "YouTube Short",
  "YouTube Video",
  "Facebook Reel",
  "Instagram Reel",
  "Custom Project",
];

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

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">Your idea. Your voice. Your outlet.</p>
      </div>

      <section className="flex flex-col gap-3">
        <label htmlFor="idea" className="text-sm font-medium">
          What do you want to create?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="idea"
            disabled
            placeholder="Creation is wired up in a later milestone"
            className="h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            className="h-11 shrink-0 rounded-lg border border-border px-4 text-sm text-muted disabled:cursor-not-allowed"
          >
            Start
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Quick create</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_CREATE.map((platform) => (
            <div
              key={platform}
              aria-disabled
              className="flex min-h-24 flex-col justify-between rounded-lg border border-border bg-surface p-4 opacity-60"
            >
              <span className="text-sm font-medium">{platform}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">Soon</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Recent projects</h2>
        {recentProjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            No projects yet. Project creation ships with the first Create Video milestone.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentProjects.map((project) => (
              <li
                key={project.id}
                className="rounded-lg border border-border bg-surface p-4 text-sm"
              >
                {project.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Generation jobs</h2>
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
          No jobs yet. The background job system ships alongside real generation.
        </p>
      </section>
    </div>
  );
}
