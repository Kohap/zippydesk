import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-100 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        brand: "btn-brand",
        ghost: "btn-ghost",
        danger: "btn-danger",
        quiet: "bg-transparent text-ink-muted hover:text-ink-text hover:bg-panel-2",
      },
      size: {
        lg: "h-[52px] px-7 text-[16px] rounded-[12px]",
        md: "h-[46px] px-5 text-[15px] rounded-[10px]",
        sm: "h-11 md:h-10 px-4 text-sm rounded-[10px]",
        icon: "h-10 w-10 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "brand", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
