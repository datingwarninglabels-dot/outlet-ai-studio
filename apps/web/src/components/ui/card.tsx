import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * The one card construction for the whole app: `rounded-xl` panel on
 * --surface with a --border hairline. `interactive` adds the hover
 * treatment used by list rows that link somewhere; `tone` swaps the
 * border/background for a status-carrying card (used by the job
 * confirm/stall cards and the paywall).
 */
export function Card({
  interactive = false,
  tone = "default",
  className,
  children,
  ...rest
}: ComponentProps<"div"> & {
  interactive?: boolean;
  tone?: "default" | "accent" | "danger" | "warning";
}) {
  const tones = {
    default: "border-border bg-surface",
    accent: "border-accent/40 bg-accent-soft",
    danger: "border-danger/40 bg-danger-soft",
    warning: "border-warning/40 bg-warning-soft",
  } as const;

  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        tones[tone],
        interactive && "transition-colors hover:border-border-strong hover:bg-surface-raised",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn("text-sm font-semibold text-foreground", className)}>{children}</h3>;
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-3 text-sm", className)}>{children}</div>;
}
