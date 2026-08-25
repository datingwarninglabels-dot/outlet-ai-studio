"use client";

import { useEffect, useRef, useState } from "react";

type JobStatus = { id: string; type: string; status: string };

const PENDING_STATUSES = new Set(["queued", "awaiting_confirmation", "running"]);
const POLL_INTERVAL_MS = 8000;

const JOB_LABELS: Record<string, string> = {
  script: "Script",
  storyboard: "Storyboard",
  voice: "Voice",
  visual: "Visual",
  animation: "Animation",
  assembly: "Video assembly",
  thumbnail: "Thumbnail generation",
};

/**
 * Section 20: "Notifications for completed or failed generation jobs, with
 * explicit permission." This only notifies while the tab is open and
 * polling — true background push (delivered even with the app fully
 * closed) needs a service-worker push subscription plus server-side VAPID
 * infrastructure, which isn't built here; that's a real gap, not an
 * oversight, and is called out as such in PLAN.md rather than silently
 * left unmentioned.
 */
export function JobNotifications({ projectId, initialJobs }: { projectId: string; initialJobs: JobStatus[] }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const lastStatusRef = useRef<Map<string, string>>(new Map(initialJobs.map((j) => [j.id, j.status])));

  useEffect(() => {
    if (permission !== "granted") {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}/job-status`);
        if (!res.ok) return;
        const { jobs } = (await res.json()) as { jobs: JobStatus[] };
        if (cancelled) return;

        for (const job of jobs) {
          const previous = lastStatusRef.current.get(job.id);
          if (previous && PENDING_STATUSES.has(previous) && !PENDING_STATUSES.has(job.status)) {
            const label = JOB_LABELS[job.type] ?? job.type;
            const succeeded = job.status === "succeeded";
            new Notification(succeeded ? `${label} finished` : `${label} failed`, {
              body: succeeded
                ? "Your generation job completed — back in Outlet AI Studio to see it."
                : "Something went wrong — check the project page for details.",
              icon: "/icons/icon-192.png",
            });
          }
          lastStatusRef.current.set(job.id, job.status);
        }
      } catch {
        // Best-effort — a failed poll just tries again next interval.
      }
    }

    const hasPending = [...lastStatusRef.current.values()].some((s) => PENDING_STATUSES.has(s));
    if (!hasPending) {
      return;
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [permission, projectId]);

  if (permission === "unsupported" || permission === "denied") {
    return null;
  }

  if (permission === "granted") {
    return <p className="text-xs text-muted">Job-completion notifications are on for this tab.</p>;
  }

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await Notification.requestPermission();
        setPermission(result);
      }}
      className="h-11 w-fit rounded-lg border border-border px-4 text-sm hover:bg-surface-raised"
    >
      Notify me when jobs finish
    </button>
  );
}
