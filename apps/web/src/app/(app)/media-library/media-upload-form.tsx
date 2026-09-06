"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Select, useActionToast } from "@/components/ui";
import { MEDIA_CATEGORIES } from "@/lib/media-categories";
import { uploadMedia } from "./actions";

const initialState = { error: "" };

export function MediaUploadForm({ projects }: { projects: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(uploadMedia, initialState);
  useActionToast(state, pending, "File uploaded.");

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="category" label="Category">
          <Select name="category" required>
            {MEDIA_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="projectId" label="Project" optional>
          <Select name="projectId" defaultValue="">
            <option value="">Shared library (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="file" label="File">
          <input
            type="file"
            name="file"
            required
            className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm"
          />
        </Field>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" pending={pending} pendingLabel="Uploading…" className="w-fit">
        Upload
      </Button>
    </form>
  );
}
