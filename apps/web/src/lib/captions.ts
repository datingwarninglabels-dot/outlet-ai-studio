export type CaptionScene = {
  narration: string;
  durationSeconds: number | null;
};

const DEFAULT_SCENE_SECONDS = 5;

function formatTimestamp(totalSeconds: number, decimalSeparator: "," | "."): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(totalWholeSeconds / 3600);
  const minutes = Math.floor((totalWholeSeconds % 3600) / 60);
  const seconds = totalWholeSeconds % 60;

  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${decimalSeparator}${pad(ms, 3)}`;
}

/**
 * One caption cue per scene — there's no word-level timing (no ASR/forced
 * alignment), only a per-scene duration estimate, so a scene's whole
 * narration appears as a single cue rather than being split into
 * shorter reading-speed-sized lines.
 */
export function buildSrt(scenes: CaptionScene[]): string {
  let cursor = 0;
  return scenes
    .map((scene, index) => {
      const duration = scene.durationSeconds ?? DEFAULT_SCENE_SECONDS;
      const start = formatTimestamp(cursor, ",");
      const end = formatTimestamp(cursor + duration, ",");
      cursor += duration;
      return `${index + 1}\n${start} --> ${end}\n${scene.narration}\n`;
    })
    .join("\n");
}

export function buildVtt(scenes: CaptionScene[]): string {
  let cursor = 0;
  const cues = scenes
    .map((scene) => {
      const duration = scene.durationSeconds ?? DEFAULT_SCENE_SECONDS;
      const start = formatTimestamp(cursor, ".");
      const end = formatTimestamp(cursor + duration, ".");
      cursor += duration;
      return `${start} --> ${end}\n${scene.narration}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}
