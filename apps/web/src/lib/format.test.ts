import { describe, expect, it } from "vitest";
import { relativeTime } from "./format";

const NOW = new Date("2026-09-06T12:00:00Z");

describe("relativeTime", () => {
  it("says 'just now' within the last ~45 seconds", () => {
    expect(relativeTime(new Date("2026-09-06T11:59:30Z"), NOW)).toBe("just now");
  });

  it("formats minutes, hours, and days in the past", () => {
    expect(relativeTime(new Date("2026-09-06T11:30:00Z"), NOW)).toBe("30 minutes ago");
    expect(relativeTime(new Date("2026-09-06T09:00:00Z"), NOW)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-09-04T12:00:00Z"), NOW)).toBe("2 days ago");
  });

  it("formats a future time", () => {
    expect(relativeTime(new Date("2026-09-08T12:00:00Z"), NOW)).toBe("in 2 days");
  });

  it("accepts a string or number timestamp", () => {
    expect(relativeTime("2026-09-06T09:00:00Z", NOW)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-09-06T09:00:00Z").getTime(), NOW)).toBe("3 hours ago");
  });
});
