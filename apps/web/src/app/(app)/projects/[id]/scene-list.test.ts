import { describe, expect, it } from "vitest";
import { reorder, type SceneData } from "./scene-reorder";

function scene(id: string): SceneData {
  return {
    id,
    narration: "",
    visualDescription: "",
    audioDirection: "",
    durationSeconds: 5,
    provider: null,
    model: null,
    version: 1,
    characterId: null,
    worldId: null,
  };
}

const ids = (s: SceneData[]) => s.map((x) => x.id).join("");

describe("reorder (optimistic scene move)", () => {
  const list = [scene("a"), scene("b"), scene("c")];

  it("moves a scene up", () => {
    expect(ids(reorder(list, { id: "b", direction: "up" }))).toBe("bac");
  });

  it("moves a scene down", () => {
    expect(ids(reorder(list, { id: "b", direction: "down" }))).toBe("acb");
  });

  it("is a no-op at the top / bottom edges", () => {
    expect(ids(reorder(list, { id: "a", direction: "up" }))).toBe("abc");
    expect(ids(reorder(list, { id: "c", direction: "down" }))).toBe("abc");
  });

  it("is a no-op for an unknown id and never mutates the input", () => {
    const copy = list.slice();
    expect(ids(reorder(list, { id: "z", direction: "up" }))).toBe("abc");
    expect(list).toEqual(copy);
  });
});
