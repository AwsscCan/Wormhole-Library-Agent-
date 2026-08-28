import { describe, expect, it } from "vitest";
import { readDisplayMath, tokenizeInlineMath } from "@/lib/notes/mathMarkdown";

describe("math markdown tokens", () => {
  it("keeps prose while exposing inline LaTex as a distinct token", () => {
    expect(tokenizeInlineMath("面积为 $x^2$，而不是普通文本。")).toEqual([
      { kind: "text", value: "面积为 " }, { kind: "math", value: "x^2" }, { kind: "text", value: "，而不是普通文本。" },
    ]);
  });

  it("does not consume escaped or unclosed dollars", () => {
    expect(tokenizeInlineMath("价格是 \\$5，表达式 $x")).toEqual([{ kind: "text", value: "价格是 \\$5，表达式 $x" }]);
  });

  it("reads display math across lines", () => {
    expect(readDisplayMath(["前言", "$$", "E = mc^2", "$$", "结语"], 1)).toEqual({ latex: "E = mc^2", endLine: 3 });
  });
});
