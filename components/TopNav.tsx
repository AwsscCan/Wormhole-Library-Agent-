"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Telescope, Brain, BookUser, Landmark, PenLine, NotebookPen, Settings2, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { themeFromCookie } from "@/lib/preferences/theme";

const LINKS = [
  { href: "/", label: "探索台", en: "EXPLORE", icon: Telescope },
  { href: "/research", label: "研究工作区", en: "RESEARCH", icon: Map },
  { href: "/memory", label: "记忆核心", en: "MEMORY", icon: Brain },
  { href: "/writing", label: "写作工作台", en: "WRITING", icon: PenLine },
  { href: "/notes", label: "研究笔记", en: "NOTES", icon: NotebookPen },
  { href: "/living-library", label: "活馆藏", en: "LIVING LIB", icon: BookUser },
  { href: "/settings/providers", label: "模型设置", en: "MODELS", icon: Settings2 },
];

export function TopNav() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.dataset.theme = themeFromCookie(document.cookie);
  }, []);
  return (
    <nav className="sticky top-0 z-40 border-b border-ink-border bg-ink/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center px-3 xl:h-14 xl:flex-nowrap xl:gap-4 xl:px-5">
        <div className="flex h-14 w-full min-w-0 items-center gap-3 xl:w-auto">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Landmark className="h-5 w-5 text-pulse" />
          <span className="truncate font-display text-lg tracking-wide text-ivory">
            Wormhole<span className="text-pulse"> Library</span>
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-steel-dim md:inline">
            knowledge nav system
          </span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 border-l border-ink-border pl-4 2xl:flex">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse shadow-glow-cyan-sm" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">source-aware catalog</span>
          </div>
          <AuthStatus />
        </div>
        </div>

        <div className="order-last flex w-full min-w-0 items-center gap-1.5 overflow-x-auto border-t border-ink-border/60 py-2 xl:order-none xl:ml-auto xl:w-auto xl:border-0 xl:py-0">
          {LINKS.map(({ href, label, en, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "border-pulse/40 bg-pulse-faint/30 text-pulse"
                    : "border-transparent text-steel hover:border-ink-border hover:text-ivory",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                <span className="hidden font-mono text-[9px] tracking-widest opacity-60 lg:inline">
                  {en}
                </span>
              </Link>
            );
          })}
        </div>

      </div>
    </nav>
  );
}
