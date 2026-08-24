import Link from "next/link";
import { BookOpenText, FileText } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export default function ReviewPage() {
  return <div className="mx-auto max-w-3xl space-y-4">
    <header><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><BookOpenText className="h-5 w-5 text-copper" />文献综述工作台</h1><p className="mt-1 text-sm text-steel">综述写作已迁移到以登录主体和 session 证据为边界的草稿工作区。</p></header>
    <Panel><PanelHeader icon={FileText} title="evidence-bound drafting" accent="cyan" /><PanelBody className="space-y-3 text-sm text-steel"><p>旧演示页不再提交固定身份或使用模拟馆藏。请从你的 research session 中选择本章节所需、已验证的证据，生成可回链的 Markdown 草稿。</p><Link href="/writing" className="inline-flex rounded-md border border-pulse/40 px-4 py-2 text-pulse hover:bg-pulse/10">打开证据约束写作</Link></PanelBody></Panel>
  </div>;
}
