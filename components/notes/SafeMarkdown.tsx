"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import katex from "katex";
import { readDisplayMath, tokenizeInlineMath } from "@/lib/notes/mathMarkdown";

type SafeMarkdownProps = {
  markdown: string;
  className?: string;
};

const markdownOptions = { html: false };

function sanitizeMarkdown(markdown: string) {
  void markdownOptions;
  return markdown
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "");
}

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function linkMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^\s)]+\))/g);
  return parts.map((part, index) => {
    const match = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
    if (!match) return part;
    const href = safeHref(match[2]);
    return href ? (
      <a key={`${match[2]}-${index}`} href={href} target="_blank" rel="noreferrer noopener" className="text-pulse underline underline-offset-2">
        {match[1]}
      </a>
    ) : match[1];
  });
}

function MathFragment({ latex, display = false }: { latex: string; display?: boolean }) {
  const target = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!target.current) return;
    try {
      katex.render(latex, target.current, { displayMode: display, throwOnError: true, trust: false, strict: "warn" });
      setFailed(false);
    } catch { setFailed(true); }
  }, [display, latex]);
  if (failed) return <code className="rounded border border-rosewood/50 bg-rosewood/10 px-1 py-0.5 font-mono text-xs text-rosewood">LaTeX: {latex}</code>;
  return <span ref={target} className={display ? "my-3 block overflow-x-auto text-ivory" : "inline-block align-middle text-ivory"} aria-label={`LaTeX: ${latex}`} />;
}

function inlineMarkdown(text: string): ReactNode[] {
  return tokenizeInlineMath(text).flatMap((token, index) => {
    if (token.kind === "math") return [<MathFragment key={`math-${index}-${token.value}`} latex={token.value} />];
    return linkMarkdown(token.value).map((node, linkIndex) => <span key={`text-${index}-${linkIndex}`}>{node}</span>);
  });
}

export function SafeMarkdown({ markdown, className }: SafeMarkdownProps) {
  const lines = sanitizeMarkdown(markdown).split(/\r?\n/);
  const rendered: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  function flushList() {
    if (listItems.length) {
      rendered.push(<ul key={`list-${rendered.length}`} className="list-disc space-y-1 pl-5">{listItems}</ul>);
      listItems = [];
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const displayMath = readDisplayMath(lines, index);
    if (displayMath) {
      flushList();
      rendered.push(<MathFragment key={`display-math-${index}`} latex={displayMath.latex} display />);
      index = displayMath.endLine;
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      listItems.push(<li key={`item-${index}`}>{inlineMarkdown(item[1])}</li>);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
      rendered.push(<Heading key={`heading-${index}`} className="font-display text-ivory">{inlineMarkdown(heading[2])}</Heading>);
      continue;
    }
    rendered.push(<p key={`paragraph-${index}`} className="leading-7">{inlineMarkdown(line)}</p>);
  }
  flushList();

  return <div className={className}>{rendered}</div>;
}
