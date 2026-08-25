"use client";

import { useActionState } from "react";
import { MEDIA_CATEGORIES } from "@/lib/media-categories";
import { uploadMedia } from "./actions";

const initialState = { error: "" };

export function MediaUploadForm({ projects }: { projects: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(uploadMedia, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-muted">
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          >
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="projectId" className="text-xs text-muted">
            Project (optional)
          </label>
          <select
            id="projectId"
            name="projectId"
            defaultValue=""
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent-teal"
          >
            <option value="">Shared library (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="file" className="text-xs text-muted">
            File
          </label>
          <input
            id="file"
            type="file"
            name="file"
            required
            className="text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm"
          />
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}
