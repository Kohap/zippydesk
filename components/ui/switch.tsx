"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border border-line-strong bg-panel-3 transition-colors duration-150",
      "data-[state=checked]:border-aqua data-[state=checked]:bg-aqua/85",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-[20px] w-[20px] rounded-full bg-white shadow-none transition-transform duration-150",
        "translate-x-[3px] data-[state=checked]:translate-x-[23px]",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[8px] bg-panel-3", className)} aria-hidden />;
}
