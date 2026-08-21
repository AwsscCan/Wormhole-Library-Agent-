"use client";

import { useState } from "react";
import { BookOpenText, Check, FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { ReviewFocus, ReviewResponse } from "@/lib/types";

const DEMO_USER = "demo-user";
const SOURCES = [
  { id: "r_aima", title: "Artificial Intelligence: A Modern Approach", meta: "AI Agent · 2020" },
  { id: "r_multiagent_systems", title: "Multiagent Systems", meta: "Multi-Agent · 2009" },
  { id: "r_game_theory_intro", title: "An Introduction to Game Theory", meta: "Game Theory · 2003" },
  { id: "r_cognitive_psych", title: "Cognitive Psychology and Its Implications", meta: "Memory · 2015" },
  { id: "r_intro_ir", title: "Introduction to Information Retrieval", meta: "RAG · 2008" },
  { id: "r_pkm_zh", title: "卡片笔记写作法：如何实现从阅读到写作", meta: "PKM · 2021" },
] as const;

const FOCUS: Array<{ value: ReviewFocus; label: string; description: string }> = [
  { value: "methods", label: "方法", description: "比较研究方法与技术路线" },
  { value: "findings", label: "发现", description: "归纳共同结论与差异" },
  { value: "timeline", label: "时间线", description: "梳理概念的演进顺序" },
];

export default function ReviewPage() {
  const [selected, setSelected] = useState<string[]>(["r_aima", "r_multiagent_systems", "r_game_theory_intro"]);
  const [focus, setFocus] = useState<ReviewFocus>("methods");
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle(id: string) {
    setResult(null);
    setError(null);
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return current.length < 5 ? [...current, id] : current;
    });
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: DEMO_USER, paperIds: selected, focus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "生成综述失败");
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成综述失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl text-ivory">
          <BookOpenText className="h-5 w-5 text-copper" />
          文献综述工作台
        </h1>
        <p className="mt-1 text-sm text-steel">
          选择 3–5 条已检索馆藏，生成一段可追溯的综述草稿；降级时明确保留原始摘要来源。
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Panel>
          <PanelHeader
            icon={FileText}
            title="sources · 选择阅读材料"
            accent="copper"
            right={<span className="font-mono text-[10px] text-steel-dim">{selected.length}/5</span>}
          />
          <PanelBody className="space-y-2.5">
            {SOURCES.map((source) => {
              const active = selected.includes(source.id);
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => toggle(source.id)}
                  className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${active ? "border-pulse/50 bg-pulse-faint/25" : "border-ink-border bg-ink-raise/60 hover:border-ink-edge"}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-pulse bg-pulse text-ink" : "border-steel-dim"}`}>
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-ivory">{source.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-steel-dim">{source.meta}</span>
                  </span>
                </button>
              );
            })}
            <p className="pt-1 text-[11px] text-steel-dim">至少选 3 条；已达上限时请先取消一条再选择。</p>
          </PanelBody>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader icon={Sparkles} title="focus · 综述视角" accent="cyan" />
            <PanelBody className="space-y-2.5">
              {FOCUS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setFocus(option.value); setResult(null); }}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${focus === option.value ? "border-pulse/50 bg-pulse-faint/25" : "border-ink-border bg-ink-raise/60 hover:border-ink-edge"}`}
                >
                  <span className="text-sm text-ivory">{option.label}</span>
                  <span className="ml-2 text-xs text-steel">{option.description}</span>
                </button>
              ))}
              <Button variant="solid" className="mt-1 w-full" loading={loading} disabled={selected.length < 3} onClick={generate}>
                <Sparkles className="h-4 w-4" />生成综述草稿
              </Button>
            </PanelBody>
          </Panel>

          {error && <p className="rounded-md border border-rosewood/40 bg-rosewood/10 p-3 text-sm text-rosewood">{error}</p>}
          {result && (
            <Panel>
              <PanelHeader
                icon={BookOpenText}
                title="draft · 综述草稿"
                accent="copper"
                right={<Badge tone={result.source === "ollama" ? "cyan" : "copper"}>{result.source === "ollama" ? "LLM" : "摘要拼接模式"}</Badge>}
              />
              <PanelBody>
                <p className="text-sm leading-7 text-steel">{result.reviewText}</p>
                <p className="mt-3 font-mono text-[10px] text-steel-dim">已使用：{result.papersUsed.join(" · ")}</p>
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
