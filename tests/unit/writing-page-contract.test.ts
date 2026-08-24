import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("writing workspace contract", () => {
  it("does not submit userId and renders the fallback label with evidence markers", async () => {
    const source = await readFile("app/writing/page.tsx", "utf8");

    expect(source).not.toContain("userId:");
    expect(source).toContain("/api/v3/writing/drafts");
    expect(source).toContain("deterministic");
    expect(source).toContain("citations");
    expect(source).toContain("完整 session collection 保留");
    expect(source).toContain(".slice(0, 12)");
  });

  it("renders Markdown without executable raw HTML and hardens outbound links", async () => {
    const source = await readFile("components/notes/SafeMarkdown.tsx", "utf8");

    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).toContain("noreferrer noopener");
    expect(source).toContain("html: false");
  });
});
