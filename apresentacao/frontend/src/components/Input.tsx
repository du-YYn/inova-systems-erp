import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, id, ...rest }, ref) => {
    const inputId = id ?? `inp-${Math.random().toString(36).slice(2, 8)}`;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="label-caps">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...rest}
          className={clsx(
            "bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2.5 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-tertiary)] transition-colors focus:border-[color:var(--color-gold)]",
            error && "border-red-500/60",
            className
          )}
        />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";
