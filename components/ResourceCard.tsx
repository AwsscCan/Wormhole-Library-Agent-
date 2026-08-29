import { BookMarked, ExternalLink, FileText, GraduationCap, ScrollText, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceCard as ResourceCardData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TYPE_META: Record<ResourceCardData["type"], { label: string; icon: LucideIcon }> = {
  book: { label: "馆藏图书", icon: BookMarked },
  paper: { label: "论文", icon: FileText },
  course: { label: "课程", icon: GraduationCap },
  thesis: { label: "学位论文", icon: ScrollText },
};

const AVAIL_META: Record<
  ResourceCardData["availability"],
  { label: string; tone: "cyan" | "copper" | "steel" | "rose" }
> = {
  available: { label: "在馆可借", tone: "cyan" },
  online: { label: "在线可读", tone: "cyan" },
  checked_out: { label: "已借出", tone: "rose" },
  unknown: { label: "状态未知", tone: "steel" },
};

const DIFF_LABEL: Record<ResourceCardData["difficulty"], string> = {
  intro: "入门",
  undergrad: "本科",
  graduate: "研究生",
  research: "研究级",
};

/** 馆藏情报卡：铜金强调（图书馆资源 = 铜色系） */
export function ResourceCard({
  resource,
  compact,
}: {
  resource: ResourceCardData;
  compact?: boolean;
}) {
  const type = TYPE_META[resource.type];
  const avail = AVAIL_META[resource.availability];
  const TypeIcon = type.icon;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-md border border-ink-border bg-ink-raise/70 transition-colors hover:border-copper/40",
        compact ? "p-3" : "p-3.5",
      )}
    >
      {/* 左侧铜色情报条 */}
      <span className="absolute inset-y-0 left-0 w-[2px] bg-copper/50 transition-colors group-hover:bg-copper" />

      <div className="flex items-start justify-between gap-2 pl-2">
        <h3
          className={cn(
            "min-w-0 font-display leading-snug text-ivory",
            compact ? "text-[13.5px] line-clamp-2" : "text-[15px] line-clamp-2",
          )}
        >
          {resource.title}
        </h3>
        <Badge tone="copper" className="shrink-0">
          <TypeIcon className="h-3 w-3" />
          {type.label}
        </Badge>
      </div>

      <p className="mt-0.5 truncate pl-2 text-[11.5px] text-steel-dim">
        {resource.authors.join(" · ")}
        {resource.year ? ` · ${resource.year}` : ""} ·{" "}
        {resource.language === "zh" ? "中文" : "EN"}
      </p>

      <p className={cn("mt-1.5 pl-2 text-xs leading-relaxed text-steel", compact ? "line-clamp-2" : "line-clamp-3")}>
        {resource.why}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-2">
        <Badge tone={avail.tone}>{avail.label}</Badge>
        <Badge tone="steel">难度 · {DIFF_LABEL[resource.difficulty]}</Badge>
        {resource.sourceLabel && <Badge tone={resource.sourceKind === "seed" ? "steel" : "copper"}>{resource.sourceLabel}</Badge>}
        {resource.location && (
          <Badge tone="steel" className="max-w-[220px]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{resource.location}</span>
          </Badge>
        )}
        {resource.callNumber && (
          <span className="font-mono text-[10px] tracking-wider text-steel-dim">
            {resource.callNumber}
          </span>
        )}
      </div>

      {resource.sourceUrl && (
        <a
          href={resource.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1 pl-2 text-[11px] text-pulse hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> 查看原始来源
        </a>
      )}

      {!compact && resource.concepts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-2">
          {resource.concepts.map((c) => (
            <span key={c.id} className="font-mono text-[10px] text-steel-dim">
              #{c.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
