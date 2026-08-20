"use client";
import type { WormholeCard as WormholeCardData } from "@/lib/types";
import { ResourceCard } from "./ResourceCard";
import { LivingBookCard } from "./LivingBookCard";
import { FeedbackBar } from "./FeedbackBar";

export function WormholeCard({
  wormhole,
  interactionId,
  userId,
  onFeedbackDone,
}: {
  wormhole: WormholeCardData;
  interactionId: string;
  userId: string;
  onFeedbackDone?: () => void;
}) {
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <h3>🌀 虫洞 → {wormhole.destination}</h3>
      <div className="wormhole-path">
        {wormhole.path.map((name, i) => (
          <span key={`${name}-${i}`} style={{ display: "contents" }}>
            {i > 0 && <span className="arrow">→</span>}
            <span className={`node${i === wormhole.path.length - 1 ? " dest" : ""}`}>{name}</span>
          </span>
        ))}
      </div>
      <p className="why">{wormhole.explanation}</p>
      <div className="scores">
        <span>意外度 {wormhole.scores.novelty}</span>
        <span>桥梁强度 {wormhole.scores.bridge}</span>
        <span>资源质量 {wormhole.scores.quality}</span>
        <span>总分 {wormhole.scores.final}</span>
      </div>

      {wormhole.resources.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "14px 0 6px" }}>落点馆藏</h2>
          {wormhole.resources.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </>
      )}
      {wormhole.livingBooks.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "14px 0 6px" }}>落点 Living Book</h2>
          {wormhole.livingBooks.map((lb) => (
            <LivingBookCard key={lb.id} livingBook={lb} userId={userId} />
          ))}
        </>
      )}

      <FeedbackBar
        userId={userId}
        interactionId={interactionId}
        targetType="wormhole"
        targetId={wormhole.id}
        onDone={onFeedbackDone}
      />
    </div>
  );
}
