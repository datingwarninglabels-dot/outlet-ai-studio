// Pure derivation of the project pipeline's per-step state, so the project
// page and its stepper agree on "where am I / what's next" without either
// re-implementing the rules. Unit-tested.

export type PipelineStepId =
  | "script"
  | "storyboard"
  | "voice"
  | "visual"
  | "animation"
  | "assembly"
  | "thumbnail";

export type PipelineStepState =
  | "locked" // prerequisites not met yet
  | "ready" // can be started now
  | "awaiting_confirmation" // a job is waiting for the user to confirm cost
  | "running" // a job is queued or running
  | "failed" // the most recent job for this step failed
  | "done"; // this step's output exists

export type PipelineStep = {
  id: PipelineStepId;
  label: string;
  state: PipelineStepState;
  /** Short reason shown when the step is locked. */
  lockedReason?: string;
};

export type JobLike = { type: string; status: string } | undefined;

export type PipelineInput = {
  hasScript: boolean;
  sceneCount: number;
  hasVoice: boolean;
  scenesWithVisual: number;
  scenesWithAnimation: number;
  hasFinalVideo: boolean;
  thumbnailCount: number;
  /** Most-recent job per type, or undefined if none exists. */
  jobByType: Partial<Record<PipelineStepId, JobLike>>;
};

const LABELS: Record<PipelineStepId, string> = {
  script: "Script",
  storyboard: "Storyboard",
  voice: "Voice",
  visual: "Visuals",
  animation: "Animation",
  assembly: "Final video",
  thumbnail: "Thumbnails",
};

function jobState(job: JobLike): PipelineStepState | null {
  if (!job) return null;
  if (job.status === "awaiting_confirmation") return "awaiting_confirmation";
  if (job.status === "queued" || job.status === "running") return "running";
  if (job.status === "failed") return "failed";
  return null;
}

export function derivePipeline(input: PipelineInput): PipelineStep[] {
  const {
    hasScript,
    sceneCount,
    hasVoice,
    scenesWithVisual,
    scenesWithAnimation,
    hasFinalVideo,
    thumbnailCount,
    jobByType,
  } = input;

  const allScenesHaveVisual = sceneCount > 0 && scenesWithVisual >= sceneCount;

  function resolve(
    id: PipelineStepId,
    done: boolean,
    prerequisiteMet: boolean,
    lockedReason: string,
  ): PipelineStep {
    const active = jobState(jobByType[id]);
    let state: PipelineStepState;
    if (done) state = "done";
    else if (active) state = active;
    else if (!prerequisiteMet) state = "locked";
    else state = "ready";
    return { id, label: LABELS[id], state, lockedReason: state === "locked" ? lockedReason : undefined };
  }

  return [
    resolve("script", hasScript, true, ""),
    resolve("storyboard", sceneCount > 0, hasScript, "Generate a script first"),
    resolve("voice", hasVoice, sceneCount > 0, "Generate a storyboard first"),
    resolve("visual", allScenesHaveVisual, sceneCount > 0, "Generate a storyboard first"),
    resolve(
      "animation",
      scenesWithVisual > 0 && scenesWithAnimation >= scenesWithVisual,
      scenesWithVisual > 0,
      "Generate at least one scene visual first",
    ),
    resolve(
      "assembly",
      hasFinalVideo,
      hasVoice && allScenesHaveVisual,
      "Needs a voice track and a visual for every scene",
    ),
    resolve("thumbnail", thumbnailCount > 0, true, ""),
  ];
}
