import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-[3px] text-[12px] font-medium leading-4",
  {
    variants: {
      variant: {
        neutral: "bg-panel-2 text-ink-muted border border-line",
        good: "bg-good-soft text-good-text border border-good-line",
        warn: "bg-warn-soft text-warn-text border border-warn-line",
        bad: "bg-bad-soft text-bad-text border border-bad-line",
        brand: "bg-aqua-soft text-aqua-text border border-aqua-line",
        ocean: "bg-ocean-soft text-ocean-text border border-ocean-line",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
