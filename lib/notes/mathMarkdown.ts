export type InlineMathToken =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string };

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

/** Splits inline `$math$` without interpreting HTML or Markdown links. */
export function tokenizeInlineMath(source: string): InlineMathToken[] {
  const tokens: InlineMathToken[] = [];
  let textStart = 0;
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] !== "$" || isEscaped(source, cursor) || source[cursor + 1] === "$") { cursor += 1; continue; }
    let close = cursor + 1;
    while (close < source.length && (source[close] !== "$" || isEscaped(source, close))) close += 1;
    if (close >= source.length || close === cursor + 1) { cursor += 1; continue; }
    if (textStart < cursor) tokens.push({ kind: "text", value: source.slice(textStart, cursor) });
    tokens.push({ kind: "math", value: source.slice(cursor + 1, close) });
    cursor = close + 1;
    textStart = cursor;
  }
  if (textStart < source.length || tokens.length === 0) tokens.push({ kind: "text", value: source.slice(textStart) });
  return tokens;
}

export type DisplayMathBlock = { latex: string; endLine: number };

/** Recognizes `$$...$$` on one line or across a bounded sequence of lines. */
export function readDisplayMath(lines: string[], startLine: number): DisplayMathBlock | null {
  const opening = lines[startLine]?.trim();
  if (!opening?.startsWith("$$")) return null;
  const sameLine = opening.slice(2).indexOf("$$");
  if (sameLine >= 0) return { latex: opening.slice(2, sameLine + 2).trim(), endLine: startLine };
  const parts = [opening.slice(2)];
  for (let line = startLine + 1; line < lines.length; line += 1) {
    const close = lines[line].indexOf("$$");
    if (close >= 0) {
      parts.push(lines[line].slice(0, close));
      return { latex: parts.join("\n").trim(), endLine: line };
    }
    parts.push(lines[line]);
  }
  return null;
}
