import { describe, expect, it } from "vitest";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  jobStatusLabel,
  jobStatusTone,
  jobTypeLabel,
} from "./labels";

// The set of job statuses the schema comment documents on generation_job.
const JOB_STATUSES = ["queued", "awaiting_confirmation", "running", "succeeded", "failed", "cancelled"];
// The project job types dispatched from the project detail page.
const JOB_TYPES = ["script", "storyboard", "voice", "visual", "animation", "assembly", "thumbnail"];

describe("job labels", () => {
  it("has a human label for every known job status", () => {
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_LABEL[status]).toBeTruthy();
      expect(jobStatusLabel(status)).not.toBe(status);
    }
  });

  it("has a badge tone for every known job status", () => {
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("has a human label for every known project job type", () => {
    for (const type of JOB_TYPES) {
      expect(jobTypeLabel(type)).not.toBe(type);
    }
  });

  it("falls back to the raw value for an unknown key rather than throwing", () => {
    expect(jobTypeLabel("mystery")).toBe("mystery");
    expect(jobStatusLabel("mystery")).toBe("mystery");
    expect(jobStatusTone("mystery")).toBe("neutral");
  });
});
