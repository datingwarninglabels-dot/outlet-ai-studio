"use client";

import { useState } from "react";
import { acknowledgeContinuityCheck } from "./actions";

export function ContinuityWarningsCard({
  checkId,
  warnings,
}: {
  checkId: string;
  warnings: { field: string; note: string }[];
}) {
  const [acknowledging, setAcknowledging] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-400/40 bg-surface p-3 text-xs">
      <p className="font-medium text-amber-400">Continuity check flagged possible mismatches</p>
      <ul className="flex flex-col gap-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-muted">
            <span className="text-foreground">{w.field}:</span> {w.note}
          </li>
        ))}
      </ul>
      <form action={acknowledgeContinuityCheck} onSubmit={() => setAcknowledging(true)}>
        <input type="hidden" name="checkId" value={checkId} />
        <button
          type="submit"
          disabled={acknowledging}
          className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-surface-raised disabled:opacity-60"
        >
          {acknowledging ? "Approving..." : "Approve — this change was intentional"}
        </button>
      </form>
    </div>
  );
}
