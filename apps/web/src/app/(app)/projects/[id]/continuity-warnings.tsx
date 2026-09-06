"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
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
    <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs">
      <p className="font-medium text-warning">Continuity check flagged possible mismatches</p>
      <ul className="flex flex-col gap-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-muted">
            <span className="text-foreground">{w.field}:</span> {w.note}
          </li>
        ))}
      </ul>
      <form action={acknowledgeContinuityCheck} onSubmit={() => setAcknowledging(true)}>
        <input type="hidden" name="checkId" value={checkId} />
        <Button type="submit" variant="secondary" size="sm" pending={acknowledging} pendingLabel="Approving…">
          Approve — this change was intentional
        </Button>
      </form>
    </div>
  );
}
