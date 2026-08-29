export const THEME_IDS = ["cockpit", "inkwash", "construct"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_OPTIONS: Array<{
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    id: "cockpit",
    label: "深夜纸墨",
    description: "现有默认界面，冷墨底色与克制铜金标记。",
    swatches: ["#101418", "#79c9d0", "#d2aa70"],
  },
  {
    id: "inkwash",
    label: "山水墨卷",
    description: "宣纸纤维、松烟墨与石青印色，适合长时间阅读。",
    swatches: ["#e8e3d7", "#245f62", "#9b4b3f"],
  },
  {
    id: "construct",
    label: "抽象构成",
    description: "高对比几何网格、朱红与群青的编辑部视觉。",
    swatches: ["#f2efe6", "#1f4f99", "#d64b38"],
  },
];

export function normalizeTheme(value: string | null | undefined): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? value as ThemeId : "cockpit";
}

export function themeFromCookie(cookie: string): ThemeId {
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wl_theme="))
    ?.slice("wl_theme=".length);
  return normalizeTheme(raw ? decodeURIComponent(raw) : undefined);
}
