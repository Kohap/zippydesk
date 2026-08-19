import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-[46px] w-full rounded-[8px] border border-line-strong bg-panel px-3.5 text-[15px] text-ink-text placeholder:text-ink-faint",
        "transition-colors duration-100 hover:border-line-strong",
        "focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/25",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-[46px] w-full rounded-[8px] border border-line-strong bg-panel px-3.5 text-[15px] text-ink-text",
        "transition-colors duration-100 hover:border-line-strong",
        "focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/25",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
