"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_OPTIONS, themeFromCookie, type ThemeId } from "@/lib/preferences/theme";

export function ThemeSettings({ onSaved }: { onSaved?: (message: string) => void }) {
  const [theme, setTheme] = useState<ThemeId>("cockpit");

  useEffect(() => {
    setTheme(themeFromCookie(document.cookie));
  }, []);

  function selectTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.cookie = `wl_theme=${encodeURIComponent(nextTheme)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    onSaved?.(`界面风格已切换为“${THEME_OPTIONS.find((item) => item.id === nextTheme)?.label}”。`);
  }

  return <section aria-labelledby="appearance-heading" className="space-y-3">
    <div className="flex items-center gap-2">
      <Palette className="h-4 w-4 text-copper" />
      <div>
        <h2 id="appearance-heading" className="text-sm text-ivory">界面风格</h2>
        <p className="text-[10px] text-steel-dim">选择会立即应用，并在下次打开时保留。</p>
      </div>
    </div>
    <div className="grid gap-2 md:grid-cols-3">
      {THEME_OPTIONS.map((option) => {
        const active = theme === option.id;
        return <button
          key={option.id}
          type="button"
          aria-pressed={active}
          onClick={() => selectTheme(option.id)}
          className={`theme-choice min-h-[118px] border p-3 text-left transition-colors ${active ? "border-pulse bg-pulse-faint/25" : "border-ink-border bg-ink-raise/45 hover:border-ink-edge"}`}
        >
          <span className="mb-3 flex h-7 items-stretch overflow-hidden border border-ink-border" aria-hidden="true">
            {option.swatches.map((swatch, index) => <span key={swatch} className="flex-1" style={{ backgroundColor: swatch, flexGrow: index === 0 ? 2 : 1 }} />)}
          </span>
          <span className="flex items-center justify-between gap-2 text-sm text-ivory">
            {option.label}
            {active && <Check className="h-4 w-4 shrink-0 text-pulse" />}
          </span>
          <span className="mt-1 block text-[10px] leading-relaxed text-steel">{option.description}</span>
        </button>;
      })}
    </div>
  </section>;
}
