"use client";

import type { PipelineStep, PipelineStepState } from "@/lib/pipeline";

const STATE_LABEL: Record<PipelineStepState, string> = {
  locked: "Locked",
  ready: "Ready",
  awaiting_confirmation: "Confirm",
  running: "Running",
  failed: "Failed",
  done: "Done",
};

const STATE_DOT: Record<PipelineStepState, string> = {
  locked: "bg-border-strong",
  ready: "bg-accent",
  awaiting_confirmation: "bg-warning",
  running: "bg-accent animate-pulse",
  failed: "bg-danger",
  done: "bg-success",
};

function scrollToStep(id: string) {
  const el = document.getElementById(`step-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }
}

/**
 * Sticky progress rail across the top of the project page. Purely a
 * navigation + status aid — every actual control still lives in the
 * section it belongs to. Reads pipeline state derived server-side by
 * lib/pipeline.ts.
 */
export function ProjectPipeline({ steps }: { steps: PipelineStep[] }) {
  const done = steps.filter((s) => s.state === "done").length;

  return (
    <nav
      aria-label="Project progress"
      className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8"
    >
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>Progress</span>
        <span>
          {done} / {steps.length} done
        </span>
      </div>
      <ol className="flex gap-1.5 overflow-x-auto pb-1">
        {steps.map((step) => (
          <li key={step.id} className="shrink-0">
            <button
              type="button"
              onClick={() => scrollToStep(step.id)}
              aria-label={`${step.label}: ${STATE_LABEL[step.state]}. Jump to section.`}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:border-border-strong"
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[step.state]}`} />
              <span className="font-medium text-foreground">{step.label}</span>
              <span className="text-muted">{STATE_LABEL[step.state]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
