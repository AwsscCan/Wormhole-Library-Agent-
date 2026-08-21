import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** 驾驶舱面板：分层背景 + 细边框 + 微弱内发光 */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative rounded-lg border border-ink-border bg-ink-panel/95 shadow-hair",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  right,
  accent = "steel",
}: {
  icon?: LucideIcon;
  title: string;
  right?: React.ReactNode;
  accent?: "steel" | "cyan" | "copper";
}) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 border-b border-ink-border px-4 py-2.5",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]",
          accent === "cyan" && "text-pulse",
          accent === "copper" && "text-copper",
          accent === "steel" && "text-steel",
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{title}</span>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

export function PanelBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
