import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { generationJobs } from "@/db/schema";
import { loadOwnedProject } from "@/lib/authz";

// Section 20: "Notifications for completed or failed generation jobs, with
// explicit permission." Client-side notifications (job-notifications.tsx)
// need something to poll — this returns just enough (id/type/status) for
// the client to detect a running->succeeded/failed transition, scoped to
// the authenticated Owner's own project like every other lookup in this app.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await loadOwnedProject(id, session.user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const jobs = await db
    .select({ id: generationJobs.id, type: generationJobs.type, status: generationJobs.status })
    .from(generationJobs)
    .where(eq(generationJobs.projectId, id))
    .orderBy(desc(generationJobs.createdAt));

  return NextResponse.json({ jobs });
}
