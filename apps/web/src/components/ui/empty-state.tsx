import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The "nothing here yet" panel. Replaces the app's ~10 hand-rolled
 * `border-dashed` paragraphs. Always give it an `action` when the user
 * can do something about the emptiness — a bare description is a dead end.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
