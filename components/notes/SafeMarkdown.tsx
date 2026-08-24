import type { ReactNode } from "react";

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

function inlineMarkdown(text: string): ReactNode[] {
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

  lines.forEach((line, index) => {
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      listItems.push(<li key={`item-${index}`}>{inlineMarkdown(item[1])}</li>);
      return;
    }
    flushList();
    if (!line.trim()) return;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
      rendered.push(<Heading key={`heading-${index}`} className="font-display text-ivory">{inlineMarkdown(heading[2])}</Heading>);
      return;
    }
    rendered.push(<p key={`paragraph-${index}`} className="leading-7">{inlineMarkdown(line)}</p>);
  });
  flushList();

  return <div className={className}>{rendered}</div>;
}
