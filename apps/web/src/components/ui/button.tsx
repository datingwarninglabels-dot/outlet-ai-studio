import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-strong disabled:hover:bg-accent",
  secondary:
    "border border-border-strong bg-surface text-foreground hover:bg-surface-raised disabled:hover:bg-surface",
  ghost: "text-muted hover:bg-surface-raised hover:text-foreground",
  danger:
    "border border-danger/40 bg-danger-soft text-danger hover:border-danger/70 disabled:hover:border-danger/40",
};

const SIZES: Record<Size, string> = {
  // 44px min height keeps every button a valid touch target.
  sm: "h-9 min-h-9 px-3 text-xs gap-1.5",
  md: "h-11 min-h-11 px-4 text-sm gap-2",
};

const BASE =
  "inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

type SharedProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = SharedProps &
  Omit<ComponentProps<"button">, "className" | "children"> & {
    href?: undefined;
    /** When true: disables the button and prefixes the label with a spinner. */
    pending?: boolean;
    pendingLabel?: string;
  };

type LinkProps = SharedProps &
  Omit<ComponentProps<typeof Link>, "className" | "children"> & {
    href: string;
  };

export function Button(props: ButtonProps | LinkProps) {
  const { variant = "primary", size = "md", fullWidth, className, children, ...rest } = props;
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link className={classes} {...(rest as Omit<LinkProps, keyof SharedProps>)}>
        {children}
      </Link>
    );
  }

  const {
    pending = false,
    pendingLabel,
    type = "button",
    disabled,
    ...buttonRest
  } = rest as Omit<ButtonProps, keyof SharedProps>;

  return (
    <button className={classes} type={type} disabled={disabled || pending} {...buttonRest}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
