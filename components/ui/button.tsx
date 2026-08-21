"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "solid" | "outline" | "ghost" | "copper" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  solid:
    "bg-pulse text-ink font-medium border border-pulse hover:bg-pulse/85 hover:shadow-glow-cyan active:translate-y-px",
  outline:
    "border border-pulse/40 text-pulse hover:bg-pulse/10 hover:border-pulse/70 active:translate-y-px",
  ghost:
    "border border-ink-border text-steel hover:text-ivory hover:border-ink-edge active:translate-y-px",
  copper:
    "border border-copper/45 text-copper hover:bg-copper/10 hover:border-copper/70 active:translate-y-px",
  danger:
    "border border-rosewood/45 text-rosewood hover:bg-rosewood/10 hover:border-rosewood/70 active:translate-y-px",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse/60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
