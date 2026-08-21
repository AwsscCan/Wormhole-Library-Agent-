"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Telescope, Brain, BookUser, Landmark, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "探索台", en: "EXPLORE", icon: Telescope },
  { href: "/memory", label: "记忆核心", en: "MEMORY", icon: Brain },
  { href: "/review", label: "文献综述", en: "REVIEW", icon: ScrollText },
  { href: "/living-library", label: "活馆藏", en: "LIVING LIB", icon: BookUser },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 border-b border-ink-border bg-ink/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Landmark className="h-5 w-5 text-pulse" />
          <span className="truncate font-display text-lg tracking-wide text-ivory">
            Wormhole<span className="text-pulse"> Library</span>
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-steel-dim md:inline">
            knowledge nav system
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          {LINKS.map(({ href, label, en, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
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

        <div className="flex items-center gap-2 border-l border-ink-border pl-4">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse shadow-glow-cyan-sm" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
            demo catalog
          </span>
        </div>
      </div>
    </nav>
  );
}
