import type { ResourceCard as ResourceCardData } from "@/lib/types";

const AVAILABILITY_LABEL: Record<ResourceCardData["availability"], string> = {
  available: "在馆可借",
  checked_out: "已借出",
  online: "在线可读",
  unknown: "状态未知",
};

const DIFFICULTY_LABEL: Record<ResourceCardData["difficulty"], string> = {
  intro: "入门",
  undergrad: "本科",
  graduate: "研究生",
  research: "研究级",
};

export function ResourceCard({ resource }: { resource: ResourceCardData }) {
  return (
    <div className="card">
      <h3>
        {resource.title}
        <span className="chip" style={{ marginLeft: 8 }}>{resource.type}</span>
      </h3>
      <div className="meta">
        {resource.authors.join(", ")}
        {resource.year ? ` · ${resource.year}` : ""} · {resource.language === "zh" ? "中文" : "English"}
      </div>
      <p className="why">{resource.why}</p>
      <div className="meta">
        📍 {resource.location ?? "—"} · {AVAILABILITY_LABEL[resource.availability]} · 难度：{DIFFICULTY_LABEL[resource.difficulty]}
      </div>
      <div style={{ marginTop: 8 }}>
        {resource.concepts.map((c) => (
          <span key={c.id} className="chip">{c.name}</span>
        ))}
      </div>
    </div>
  );
}
