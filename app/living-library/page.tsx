"use client";
/**
 * Living Library 页 = 活馆藏档案库：
 * 匿名、克制、有神秘感——不是社交软件好友推荐。
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ShieldCheck, BookUser } from "lucide-react";
import type { LivingBookCard as LivingBookCardData } from "@/lib/types";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { LivingBookCard } from "@/components/LivingBookCard";
import { ConversationPanel } from "@/components/living-library/ConversationPanel";
import livingBooksSeed from "@/data/seed-living-books.json";
import { AI_LIVING_BOOK_ID } from "@/lib/livingLibrary/constants";
import type { DiscoverableLivingProfile, WorkspaceLivingProfile } from "@/lib/livingLibrary/profile";

const DEMO_USER = "demo-user";
const MY_TOPICS = ["AI Agent", "信息检索", "知识管理", "多智能体", "认知心理学"];
const AI_BOOK: LivingBookCardData = { id: AI_LIVING_BOOK_ID, displayMode: "named", displayName: "Wormhole AI 馆员", headline: "演示用 AI 活馆藏：一定会接受文字答疑，并明确标识为自动回复。", expertiseConcepts: [{ id: "ai_agent", name: "AI Agent" }, { id: "information_retrieval", name: "信息检索" }, { id: "writing", name: "研究写作" }], willingTypes: ["async_answer"], expertiseLevel: "mentor", contactState: "accepted" };
function profileCard(profile: DiscoverableLivingProfile): LivingBookCardData { return { id: profile.id, displayMode: profile.displayMode, displayName: undefined, headline: "匿名研究者活馆藏：可按公开主题交流。", expertiseConcepts: (profile.topics.length ? profile.topics : ["待补充主题"]).map((name) => ({ id: name.toLowerCase().replace(/\s+/g, "_"), name })), willingTypes: profile.willingTypes as LivingBookCardData["willingTypes"], expertiseLevel: "peer", contactState: "request_required" }; }

export default function LivingLibraryPage() {
  const [optIn, setOptIn] = useState(false);
  const [books, setBooks] = useState<LivingBookCardData[]>([]);
  const [selectedBook, setSelectedBook] = useState<LivingBookCardData | null>(null);
  const [myTopics, setMyTopics] = useState<string[]>(["知识管理"]);
  const [myWilling, setMyWilling] = useState<string[]>(["async_answer"]);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/v3/living-book/profile", { cache: "no-store" });
      const payload = response.ok ? await response.json() as WorkspaceLivingProfile & { discoverable?: DiscoverableLivingProfile[] } : null;
      const profile = payload;
      if (profile) { setMyTopics(profile.topics); setMyWilling(profile.willingTypes); setOptIn(profile.optIn); }
      const visible = livingBooksSeed.livingBooks
      .filter((lb) => lb.consentState.startsWith("discoverable"))
      .map((lb) => ({
        id: lb.id,
        displayMode: lb.displayMode as LivingBookCardData["displayMode"],
        displayName:
          lb.consentState === "discoverable_named" && lb.displayName
            ? lb.displayName
            : undefined,
        headline: lb.headline,
        expertiseConcepts: lb.conceptIds.map((id) => ({
          id,
          name: id.replace(/^c_/, "").replace(/_/g, " "),
        })),
        willingTypes: lb.willingTypes as LivingBookCardData["willingTypes"],
        expertiseLevel: lb.expertiseLevel as LivingBookCardData["expertiseLevel"],
        availabilityNote: lb.availabilityNote ?? undefined,
        contactState: "request_required" as const,
      }));
      const own = profile?.optIn ? { id: `workspace:${profile.ownerId}`, displayMode: "anonymous" as const, headline: "我的匿名活馆藏档案：可按所选主题交流。", expertiseConcepts: (profile.topics.length ? profile.topics : ["待补充主题"]).map((name) => ({ id: name.toLowerCase().replace(/\s+/g, "_"), name })), willingTypes: profile.willingTypes as LivingBookCardData["willingTypes"], expertiseLevel: "peer" as const, contactState: "accepted" as const } : null;
      setBooks([AI_BOOK, ...(own ? [own] : []), ...(payload?.discoverable ?? []).map(profileCard), ...visible]);
    };
    void load();
  }, []);

  async function saveProfile(nextOptIn = optIn) {
    setProfileSaving(true);
    try {
      const response = await fetch("/api/v3/living-book/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayMode: "anonymous", topics: myTopics, willingTypes: myWilling, optIn: nextOptIn }) });
      if (!response.ok) return;
      const profile = await response.json() as WorkspaceLivingProfile;
      setBooks((items) => {
        const withoutSelf = items.filter((item) => !item.id.startsWith("workspace:"));
        const own = profile.optIn ? { id: `workspace:${profile.ownerId}`, displayMode: "anonymous" as const, headline: "我的匿名活馆藏档案：可按所选主题交流。", expertiseConcepts: (profile.topics.length ? profile.topics : ["待补充主题"]).map((name) => ({ id: name.toLowerCase().replace(/\s+/g, "_"), name })), willingTypes: profile.willingTypes as LivingBookCardData["willingTypes"], expertiseLevel: "peer" as const, contactState: "accepted" as const } : null;
        return [withoutSelf[0], ...(own ? [own] : []), ...withoutSelf.slice(1)];
      });
    } finally { setProfileSaving(false); }
  }

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="flex items-center gap-2 font-display text-xl text-ivory">
          <Archive className="h-5 w-5 text-copper" />
          活馆藏档案库
        </h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-steel">
          图书馆不只有书——愿意分享经验的人也是馆藏。每一册「活书」都经过明确同意才可被发现，
          双方同意之前，身份与联系方式都封存在档案里。
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <Panel className="self-start">
          <PanelHeader icon={BookUser} title="my volume · 我的档案" accent="copper" />
          <PanelBody className="space-y-3 pt-3">
            <p className="text-xs leading-relaxed text-steel">把自己登记为一册可发现的活书。你的档案不会混在发现列表里，而是在这里以匿名预览呈现。</p>
            <div className="space-y-1.5"><p className="text-[10px] text-steel-dim">我的专长主题</p>{MY_TOPICS.map((topic) => <label key={topic} className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={myTopics.includes(topic)} onChange={() => setMyTopics((items) => items.includes(topic) ? items.filter((item) => item !== topic) : [...items, topic])} />{topic}</label>)}</div>
            <div className="space-y-1.5"><p className="text-[10px] text-steel-dim">愿意交流的方式</p>{[["async_answer", "文字答疑"], ["coffee_chat", "15min 交流"], ["reading_guide", "领读入门"]].map(([id, label]) => <label key={id} className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={myWilling.includes(id)} onChange={() => setMyWilling((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])} />{label}</label>)}</div>
            <Button
              variant={optIn ? "copper" : "ghost"}
              className="w-full"
              loading={profileSaving}
              onClick={() => { const next = !optIn; setOptIn(next); void saveProfile(next); }}
            >
              <ShieldCheck className="h-4 w-4" />
              {optIn ? "✓ 已登记（匿名模式）" : "登记为活书"}
            </Button>
            <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-steel-dim">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-pulse-dim" />
              可随时暂停或注销。匿名模式下不展示姓名，只展示专长领域与可提供的帮助类型。
            </p>
            {optIn && <p className="border border-pulse/25 bg-pulse-faint/20 p-2 text-[10px] text-steel">匿名预览：{myTopics.length ? myTopics.join(" · ") : "请至少选择一个专长主题"} · {myWilling.length ? "已开放交流方式" : "尚未开放交流方式"}</p>}
            {optIn && <button type="button" onClick={() => void saveProfile()} className="text-left text-[10px] text-pulse hover:underline">保存专长主题与交流方式</button>}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Archive}
            title="discoverable volumes · 可发现的活书"
            accent="copper"
            right={
              <span className="font-mono text-[10px] text-steel-dim">{books.length} vols</span>
            }
          />
          <PanelBody className="grid gap-3 pt-3 md:grid-cols-2">
            {books.map((lb, i) => (
              <motion.div
                key={lb.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <LivingBookCard livingBook={lb} userId={DEMO_USER} isSelf={lb.id.startsWith("workspace:")} onConversation={lb.id.startsWith("workspace:") ? undefined : setSelectedBook} />
              </motion.div>
            ))}
          </PanelBody>
        </Panel>
        <ConversationPanel livingBook={selectedBook} onClose={() => setSelectedBook(null)} />
      </div>
    </div>
  );
}
