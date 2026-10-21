import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-primary text-text-inverse shadow-xs hover:bg-brand-primary-600 active:translate-y-px",
        secondary: "border border-border-default bg-surface text-text-primary shadow-xs hover:bg-neutral-50 active:translate-y-px",
        ghost: "bg-transparent px-3 text-text-secondary hover:bg-neutral-100 hover:text-text-primary",
        danger: "bg-error text-text-inverse shadow-xs hover:bg-error-dark active:translate-y-px",
      },
      size: {
        default: "",
        sm: "min-h-11 px-3 text-xs",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11 min-h-11 shrink-0 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
