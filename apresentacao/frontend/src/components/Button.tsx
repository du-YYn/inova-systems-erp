import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-[color:var(--color-gold)] text-[color:var(--color-bg)] hover:bg-[color:var(--color-gold-soft)] font-medium",
  ghost:
    "bg-transparent text-[color:var(--color-text-secondary)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-elevated)] hover:text-[color:var(--color-text-primary)]",
  danger:
    "bg-transparent text-[color:var(--color-text-secondary)] border border-[color:var(--color-border)] hover:border-red-500/60 hover:text-red-400",
};

export function Button({ variant = "primary", className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}
