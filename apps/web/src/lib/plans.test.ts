import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";

describe("PLANS — landing page's single source of pricing/entitlement truth", () => {
  it("has a unique id per plan", () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("highlights exactly one plan", () => {
    expect(PLANS.filter((p) => p.highlighted)).toHaveLength(1);
  });

  it("never states a specific dollar figure — only a truthful placeholder label", () => {
    for (const plan of PLANS) {
      expect(plan.priceLabel).not.toMatch(/\$|USD|\d/);
    }
  });

  it("names a Stripe price env var per plan, ready for the future mapping, without reading it yet", () => {
    for (const plan of PLANS) {
      expect(plan.stripePriceEnvVar.length).toBeGreaterThan(0);
    }
  });

  it("every plan has at least one feature listed", () => {
    for (const plan of PLANS) {
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });
});
