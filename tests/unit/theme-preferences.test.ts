import { describe, expect, it } from "vitest";
import { normalizeTheme, themeFromCookie, THEME_OPTIONS } from "@/lib/preferences/theme";

describe("theme preferences", () => {
  it("keeps the existing midnight paper theme as the default", () => {
    expect(normalizeTheme(undefined)).toBe("cockpit");
    expect(THEME_OPTIONS[0]).toMatchObject({ id: "cockpit", label: "深夜纸墨" });
  });

  it("restores a supported style from cookies", () => {
    expect(themeFromCookie("wl_language=zh_first; wl_theme=inkwash")).toBe("inkwash");
    expect(themeFromCookie("wl_theme=construct; other=value")).toBe("construct");
  });

  it("rejects unknown cookie values", () => {
    expect(themeFromCookie("wl_theme=neon-purple")).toBe("cockpit");
  });
});
