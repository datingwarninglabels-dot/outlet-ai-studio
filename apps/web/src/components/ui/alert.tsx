import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; text: string; role: "status" | "alert" }> = {
  info: { box: "border-border bg-surface", text: "text-muted", role: "status" },
  success: { box: "border-success/40 bg-success-soft", text: "text-success", role: "status" },
  warning: { box: "border-warning/40 bg-warning-soft", text: "text-warning", role: "status" },
  danger: { box: "border-danger/40 bg-danger-soft", text: "text-danger", role: "alert" },
};

/**
 * Inline status/error message. Replaces the app's scattered
 * `<p role="alert" className="text-sm text-red-400">` and
 * `<p role="status" ...>` one-offs. `title` is optional — a bare `children`
 * renders as a single line.
 */
export function Alert({
  tone = "info",
  title,
  className,
  children,
}: {
  tone?: Tone;
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div role={t.role} className={cn("rounded-lg border p-3 text-sm", t.box, className)}>
      {title && <p className={cn("font-medium", t.text)}>{title}</p>}
      {children && <div className={cn(title ? "mt-1 text-muted" : t.text)}>{children}</div>}
    </div>
  );
}
