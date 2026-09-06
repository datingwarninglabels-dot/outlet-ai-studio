"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/ui";
import { moveScene } from "./actions";
import { SceneEditForm } from "./scene-form";
import { reorder, type SceneData } from "./scene-reorder";

/**
 * The storyboard scene list. Reorder is optimistic — the ↑/↓ buttons swap
 * scenes locally immediately, then persist via moveScene(); if the server
 * rejects it, the revalidated server order (unchanged) takes over and the
 * swap visibly reverts.
 */
export function SceneList({
  projectId,
  scenes,
  ownedCharacters,
  ownedWorlds,
}: {
  projectId: string;
  scenes: SceneData[];
  ownedCharacters: { id: string; name: string }[];
  ownedWorlds: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [optimisticScenes, applyMove] = useOptimistic(scenes, reorder);

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      applyMove({ id, direction });
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("sceneId", id);
      fd.set("direction", direction);
      const result = await moveScene({ error: "" }, fd);
      if (result.error) toast(result.error, "error");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {optimisticScenes.map((scene, index) => (
        <div key={scene.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Scene {index + 1}</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => move(scene.id, "up")}
                disabled={isPending || index === 0}
                aria-label={`Move scene ${index + 1} up`}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(scene.id, "down")}
                disabled={isPending || index === optimisticScenes.length - 1}
                aria-label={`Move scene ${index + 1} down`}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
            </div>
          </div>
          <SceneEditForm
            projectId={projectId}
            scene={scene}
            index={index}
            ownedCharacters={ownedCharacters}
            ownedWorlds={ownedWorlds}
          />
        </div>
      ))}
    </div>
  );
}
