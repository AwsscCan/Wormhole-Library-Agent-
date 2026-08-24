"use client";

import { useEffect, useState } from "react";
import { FilePlus2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";

type Note = {
  id: string;
  title: string;
  markdown: string;
  version: number;
  updatedAt: string;
};

const emptyNote = { title: "", markdown: "", version: 0 };

function messageFor(response: Response, fallback: string) {
  return response.ok ? "" : fallback;
}

export function NoteEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [draft, setDraft] = useState(emptyNote);
  const [status, setStatus] = useState("正在加载私有笔记…");
  const [saving, setSaving] = useState(false);

  async function loadNotes() {
    const response = await fetch("/api/v3/notes", { cache: "no-store" });
    if (!response.ok) {
      setStatus("暂时无法加载私有笔记。");
      return;
    }
    const nextNotes = await response.json() as Note[];
    setNotes(nextNotes);
    setStatus(nextNotes.length ? "" : "尚无笔记。创建的内容只对当前账户可见。");
  }

  useEffect(() => { void loadNotes(); }, []);

  function startNew() {
    setSelected(null);
    setDraft(emptyNote);
    setStatus("新建笔记尚未保存。");
  }

  function selectNote(note: Note) {
    setSelected(note);
    setDraft({ title: note.title, markdown: note.markdown, version: note.version });
    setStatus("");
  }

  async function save() {
    if (!draft.title.trim()) {
      setStatus("请先填写标题。");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(selected ? `/api/v3/notes/${selected.id}` : "/api/v3/notes", {
        method: selected ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected
          ? { expectedVersion: draft.version, title: draft.title, markdown: draft.markdown }
          : { title: draft.title, markdown: draft.markdown, links: [] }),
      });
      const failure = messageFor(response, "保存失败：笔记可能已被更新，请重新加载后再试。");
      if (failure) { setStatus(failure); return; }
      const note = await response.json() as Note;
      setSelected(note);
      setDraft({ title: note.title, markdown: note.markdown, version: note.version });
      setStatus("已保存。 ");
      await loadNotes();
    } catch {
      setStatus("保存失败：请检查网络后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    const response = await fetch(`/api/v3/notes/${selected.id}`, { method: "DELETE" });
    if (!response.ok) { setStatus("删除失败，请重新加载后再试。"); return; }
    startNew();
    await loadNotes();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Panel>
        <PanelHeader icon={FilePlus2} title="notes · 私有笔记" accent="copper" right={<Button size="sm" onClick={startNew}>新建</Button>} />
        <PanelBody className="space-y-2">
          {notes.map((note) => <button key={note.id} type="button" onClick={() => selectNote(note)} className={`w-full rounded-md border p-3 text-left ${selected?.id === note.id ? "border-pulse/50 bg-pulse-faint/25" : "border-ink-border bg-ink-raise/60 hover:border-ink-edge"}`}>
            <span className="block truncate text-sm text-ivory">{note.title}</span>
            <span className="mt-1 block font-mono text-[10px] text-steel-dim">v{note.version} · {new Date(note.updatedAt).toLocaleString()}</span>
          </button>)}
          {status && <p className="pt-2 text-xs text-steel">{status}</p>}
        </PanelBody>
      </Panel>
      <div className="space-y-4">
        <Panel>
          <PanelHeader icon={Save} title="editor · Markdown" accent="cyan" right={<div className="flex gap-2"><Button size="sm" variant="solid" loading={saving} onClick={save}>保存</Button>{selected && <Button size="sm" variant="danger" onClick={remove}><Trash2 className="h-3.5 w-3.5" />删除</Button>}</div>} />
          <PanelBody className="space-y-3">
            <Input value={draft.title} maxLength={160} placeholder="笔记标题" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            <textarea value={draft.markdown} maxLength={50_000} rows={15} placeholder="使用 Markdown 记录研究过程…" onChange={(event) => setDraft((current) => ({ ...current, markdown: event.target.value }))} className="w-full rounded-md border border-ink-border bg-ink-raise p-3 font-mono text-sm text-ivory focus:border-pulse/60 focus:outline-none" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="preview · 安全预览" accent="steel" />
          <PanelBody><SafeMarkdown markdown={draft.markdown || "_预览会在这里显示；原始 HTML 不会被执行。_"} className="space-y-3 text-sm text-steel" /></PanelBody>
        </Panel>
      </div>
    </div>
  );
}
