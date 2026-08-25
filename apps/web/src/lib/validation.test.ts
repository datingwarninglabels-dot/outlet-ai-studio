import { describe, expect, it } from "vitest";
import {
  brandKitSchema,
  characterSchema,
  createVideoSchema,
  loginSchema,
  projectOverridesSchema,
  sceneUpdateSchema,
  setupSchema,
  thumbnailTextSchema,
  worldSchema,
} from "./validation";

describe("characterSchema — real-person permission gate (Section 10 safety requirement)", () => {
  const base = {
    name: "Alex",
    description: "A narrator",
    face: "",
    skinTone: "",
    hair: "",
    bodyType: "",
    apparentAge: "",
    distinguishingDetails: "",
    defaultClothing: "",
    accessories: "",
    palette: "",
    negativePrompt: "",
    assignedVoiceId: "",
  };

  it("rejects a real-person character with no permission notes", () => {
    const result = characterSchema.safeParse({ ...base, isRealPerson: true, permissionNotes: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["permissionNotes"]);
    }
  });

  it("rejects a real-person character with only whitespace as permission notes", () => {
    const result = characterSchema.safeParse({ ...base, isRealPerson: true, permissionNotes: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts a real-person character with documented permission notes", () => {
    const result = characterSchema.safeParse({
      ...base,
      isRealPerson: true,
      permissionNotes: "Verbal consent obtained 2026-08-01, on file.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fictional (non-real-person) character with no permission notes", () => {
    const result = characterSchema.safeParse({ ...base, isRealPerson: false, permissionNotes: "" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace and converts empty optional fields to null", () => {
    const result = characterSchema.safeParse({ ...base, face: "  round  ", isRealPerson: false, permissionNotes: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.face).toBe("round");
      expect(result.data.hair).toBeNull();
    }
  });
});

describe("sceneUpdateSchema — optional character/world assignment", () => {
  const base = {
    sceneId: "11111111-1111-4111-8111-111111111111",
    narration: "Hello",
    visualDescription: "A sunset",
    audioDirection: "",
    durationSeconds: "10",
  };

  it("converts an empty-string characterId/worldId to null (unassigned)", () => {
    const result = sceneUpdateSchema.safeParse({ ...base, characterId: "", worldId: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characterId).toBeNull();
      expect(result.data.worldId).toBeNull();
    }
  });

  it("accepts a valid UUID for characterId/worldId", () => {
    const uuid = "22222222-2222-4222-8222-222222222222";
    const result = sceneUpdateSchema.safeParse({ ...base, characterId: uuid, worldId: uuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characterId).toBe(uuid);
    }
  });

  it("rejects a malformed (non-UUID, non-empty) characterId rather than silently accepting it", () => {
    const result = sceneUpdateSchema.safeParse({ ...base, characterId: "not-a-uuid", worldId: "" });
    expect(result.success).toBe(false);
  });

  it("coerces durationSeconds from a form-submitted string to a number", () => {
    const result = sceneUpdateSchema.safeParse({ ...base, characterId: "", worldId: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationSeconds).toBe(10);
    }
  });

  it("rejects a duration outside the 1-3600 second range", () => {
    expect(sceneUpdateSchema.safeParse({ ...base, characterId: "", worldId: "", durationSeconds: "0" }).success).toBe(
      false,
    );
    expect(
      sceneUpdateSchema.safeParse({ ...base, characterId: "", worldId: "", durationSeconds: "9999" }).success,
    ).toBe(false);
  });
});

describe("brandKitSchema — hex color validation", () => {
  const base = {
    fonts: "",
    captionStyle: "",
    watermarkEnabled: false,
    watermarkText: "",
    defaultVoiceId: "",
    defaultMusicMood: "",
    defaultVisualStyle: "",
  };

  it("accepts up to 6 valid hex colors", () => {
    const result = brandKitSchema.safeParse({ ...base, colors: ["#3366FF", "#000000", "#FFFFFF"] });
    expect(result.success).toBe(true);
  });

  it("rejects a 7th color", () => {
    const colors = Array.from({ length: 7 }, (_, i) => `#00000${i}`);
    expect(brandKitSchema.safeParse({ ...base, colors }).success).toBe(false);
  });

  it("rejects a malformed hex color (missing #, wrong length, non-hex chars)", () => {
    expect(brandKitSchema.safeParse({ ...base, colors: ["3366FF"] }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...base, colors: ["#333"] }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...base, colors: ["#GGGGGG"] }).success).toBe(false);
  });

  it("accepts an empty color list", () => {
    expect(brandKitSchema.safeParse({ ...base, colors: [] }).success).toBe(true);
  });
});

describe("worldSchema", () => {
  it("requires name and description", () => {
    expect(worldSchema.safeParse({ name: "", description: "x" }).success).toBe(false);
    expect(worldSchema.safeParse({ name: "x", description: "" }).success).toBe(false);
  });

  it("accepts a minimal valid world with all optional fields omitted", () => {
    expect(worldSchema.safeParse({ name: "Rooftop", description: "A neon rooftop" }).success).toBe(true);
  });
});

describe("projectOverridesSchema", () => {
  it("treats blank strings as clearing the override (null)", () => {
    const result = projectOverridesSchema.safeParse({ visualStyleOverride: "", voiceIdOverride: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visualStyleOverride).toBeNull();
      expect(result.data.voiceIdOverride).toBeNull();
    }
  });
});

describe("thumbnailTextSchema", () => {
  it("rejects headline text over 120 characters", () => {
    const result = thumbnailTextSchema.safeParse({
      thumbnailId: "11111111-1111-4111-8111-111111111111",
      headlineText: "x".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 120 characters", () => {
    const result = thumbnailTextSchema.safeParse({
      thumbnailId: "11111111-1111-4111-8111-111111111111",
      headlineText: "x".repeat(120),
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema / setupSchema — basic auth field shape", () => {
  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "longenough" }).success).toBe(false);
  });

  it("rejects a login password under 8 characters", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });

  it("requires a setup password of at least 12 characters (stricter than login)", () => {
    expect(setupSchema.safeParse({ name: "Owner", email: "a@b.com", password: "elevenchars" }).success).toBe(false);
    expect(setupSchema.safeParse({ name: "Owner", email: "a@b.com", password: "twelvecharss" }).success).toBe(true);
  });
});

describe("createVideoSchema", () => {
  it("rejects a platform outside the fixed PLATFORMS list", () => {
    const result = createVideoSchema.safeParse({ idea: "A cool video idea", platform: "Snapchat", mode: "quick" });
    expect(result.success).toBe(false);
  });

  it("rejects an idea shorter than 3 characters", () => {
    const result = createVideoSchema.safeParse({ idea: "ab", platform: "TikTok", mode: "quick" });
    expect(result.success).toBe(false);
  });
});
