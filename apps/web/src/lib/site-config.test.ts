import { describe, expect, it } from "vitest";
import { CTA_LABELS, CTA_MODE, PRIMARY_CTA_LABEL, SOCIAL_LINKS, SUPPORT_EMAIL, primaryCtaHref } from "./site-config";

describe("CTA_MODE — single source of truth for every primary CTA", () => {
  it("is 'waitlist' until a real registration/billing flow exists", () => {
    expect(CTA_MODE).toBe("waitlist");
  });

  it("PRIMARY_CTA_LABEL matches CTA_LABELS[CTA_MODE] so label and mode can't drift apart", () => {
    expect(PRIMARY_CTA_LABEL).toBe(CTA_LABELS[CTA_MODE]);
  });

  it("primaryCtaHref() points at the on-page waitlist form while in waitlist mode", () => {
    expect(primaryCtaHref()).toBe("#waitlist");
  });

  it("every CtaMode has a label, so switching modes can never render a blank CTA", () => {
    expect(Object.keys(CTA_LABELS).sort()).toEqual(["early-access", "live", "registration", "waitlist"]);
    for (const label of Object.values(CTA_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("missing-asset placeholders never render as fake data", () => {
  it("SUPPORT_EMAIL defaults to null rather than a fabricated address", () => {
    expect(SUPPORT_EMAIL).toBeNull();
  });

  it("SOCIAL_LINKS is empty until real URLs are provided, never a placeholder icon", () => {
    expect(SOCIAL_LINKS).toEqual([]);
  });
});
