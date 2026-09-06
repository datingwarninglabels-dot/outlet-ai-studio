export type SceneData = {
  id: string;
  narration: string;
  visualDescription: string;
  audioDirection: string;
  durationSeconds: number | null;
  provider: string | null;
  model: string | null;
  version: number;
  characterId: string | null;
  worldId: string | null;
};

export type Move = { id: string; direction: "up" | "down" };

/**
 * Pure adjacent-swap used for the optimistic scene reorder. No React, no
 * server imports — kept separate so it can be unit-tested without pulling
 * in the server-action module graph.
 */
export function reorder(scenes: SceneData[], { id, direction }: Move): SceneData[] {
  const i = scenes.findIndex((s) => s.id === id);
  if (i === -1) return scenes;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= scenes.length) return scenes;
  const next = scenes.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
