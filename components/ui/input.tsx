"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-ink-border bg-ink-raise px-3.5 text-sm text-ivory",
        "placeholder:text-steel-dim",
        "transition-colors focus:border-pulse/60 focus:outline-none focus:ring-1 focus:ring-pulse/40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
