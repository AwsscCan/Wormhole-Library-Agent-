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
import livingBooksSeed from "@/data/seed-living-books.json";

const DEMO_USER = "demo-user";

export default function LivingLibraryPage() {
  const [optIn, setOptIn] = useState(false);
  const [books, setBooks] = useState<LivingBookCardData[]>([]);

  useEffect(() => {
    // 骨架期直接读 seed 中 consent 允许的数据（与 fallback engine 同一 consent 规则）
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
    setBooks(visible);
  }, []);

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

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel className="self-start">
          <PanelHeader icon={BookUser} title="my volume · 我的档案" accent="copper" />
          <PanelBody className="space-y-3 pt-3">
            <p className="text-xs leading-relaxed text-steel">
              把自己登记为一册可发现的活书：其他同学可以按主题匿名找到你（演示功能）。
            </p>
            <Button
              variant={optIn ? "copper" : "ghost"}
              className="w-full"
              onClick={() => setOptIn((v) => !v)}
            >
              <ShieldCheck className="h-4 w-4" />
              {optIn ? "✓ 已登记（匿名模式）" : "登记为活书"}
            </Button>
            <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-steel-dim">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-pulse-dim" />
              可随时暂停或注销。匿名模式下不展示姓名，只展示专长领域与可提供的帮助类型。
            </p>
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
                <LivingBookCard livingBook={lb} userId={DEMO_USER} />
              </motion.div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
