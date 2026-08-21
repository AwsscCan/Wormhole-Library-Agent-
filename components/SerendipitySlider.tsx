"use client";
/**
 * Serendipity Slider — 探索距离控制器
 * 不是普通表单滑块：分档刻度 + 当前档位读出 + 距离渐变轨道。
 */
import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils";

const STOPS = [
  { max: 20, label: "旁边的书架", en: "NEARBY SHELF" },
  { max: 40, label: "隔壁过道", en: "NEXT AISLE" },
  { max: 60, label: "穿过楼层", en: "ACROSS FLOOR" },
  { max: 80, label: "另一栋楼", en: "ANOTHER BUILDING" },
  { max: 100, label: "把我扔进太空", en: "DEEP SPACE" },
] as const;

export function sliderLabel(value: number): string {
  return STOPS.find((s) => value <= s.max)?.label ?? "";
}

export function SerendipitySlider({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const stop = STOPS.find((s) => value <= s.max) ?? STOPS[0];
  const danger = value > 80;

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-steel">
          <Orbit className="h-3 w-3" />
          exploration range
        </span>
        <span
          className={cn(
            "font-mono text-lg tabular-nums leading-none",
            danger ? "text-rosewood" : "text-pulse",
          )}
        >
          {String(value).padStart(3, "0")}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cockpit-range"
        aria-label="Serendipity slider"
      />

      {/* 档位刻度 */}
      <div className="mt-0.5 flex justify-between">
        {STOPS.map((s) => {
          const active = s.label === stop.label;
          return (
            <span
              key={s.en}
              className={cn(
                "font-mono text-[9px] tracking-wide transition-colors",
                active
                  ? s.max > 80
                    ? "text-rosewood"
                    : "text-pulse"
                  : "text-steel-dim",
              )}
            >
              ▴
            </span>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-sm",
            danger ? "text-rosewood" : "text-ivory",
          )}
        >
          {stop.label}
        </span>
        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.18em] text-steel-dim">
          {stop.en}
        </span>
      </div>
    </div>
  );
}
