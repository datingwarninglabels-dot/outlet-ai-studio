// Small display-formatting helpers. Pure and unit-tested.

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * "3 hours ago", "in 2 days", "just now". Uses Intl.RelativeTimeFormat so
 * it localises for free. `now` is injectable for testing.
 */
export function relativeTime(date: Date | string | number, now: Date = new Date()): string {
  const then = new Date(date).getTime();
  const deltaSeconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(deltaSeconds);

  if (abs < 45) return "just now";

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secondsInUnit] of UNITS) {
    if (abs >= secondsInUnit || unit === "minute") {
      return rtf.format(Math.round(deltaSeconds / secondsInUnit), unit);
    }
  }
  return "just now";
}
