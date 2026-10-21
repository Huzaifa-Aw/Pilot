import * as React from "react";
import { cn } from "./utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "min-h-11 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-neutral-400 focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
