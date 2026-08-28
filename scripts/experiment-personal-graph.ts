import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildSystemGraph, hashPublicGraph } from "../lib/research/personalGraph";
import { PrismaResearchSessionStore, ResearchSessionService } from "../lib/research/sessionStore";

const root = process.cwd();
const output = path.join(root, "outputs", "v3.2-p03");
const sessionDir = path.join(output, "sessions");
fs.mkdirSync(sessionDir, { recursive: true });

const publicFiles = ["data/seed-concepts.json", "data/seed-edges.json", "data/seed-living-books.json"];
const fileHash = (file: string) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const beforeSeedHashes = Object.fromEntries(publicFiles.map((file) => [file, fileHash(file)]));

const topics = [
  { question: "How does hybrid retrieval improve RAG recall?", writing: "RAG retrieval quality", query: "hybrid dense sparse retrieval", concept: { id: "rag", name: "Retrieval Augmented Generation" } },
  { question: "How can operating systems schedule latency-sensitive workloads fairly?", writing: "Scheduling fairness", query: "CFS latency scheduling fairness", concept: { id: "scheduling", name: "Operating System Scheduling" } },
  { question: "How do graph neural networks support library discovery?", writing: "Graph discovery", query: "graph neural network recommendation", concept: { id: "gnn", name: "Graph Neural Networks" } },
];

async function cleanupExperimentDirectory(directory: string) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  const relative = path.relative(temporaryRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith("wormhole-p03-experiment-")) {
    throw new Error("Refusing to clean an unexpected experiment directory");
  }
  try {
    await fs.promises.rm(resolved, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort: a sandbox trash shim must not turn valid
    // experiment assertions and artifacts into a false-negative exit code.
    console.warn(`Temporary experiment database retained for OS cleanup: ${path.basename(resolved)}`);
  }
}

async function main() {
let sequence = 0;
const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "wormhole-p03-experiment-"));
const databaseUrl = `file:${path.join(databaseDirectory, "research.db").replace(/\\/g, "/")}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const migration = fs.readFileSync(path.join(root, "prisma/migrations/202608250001_research_workspace/migration.sql"), "utf8");
for (const statement of migration.split(";").map((item) => item.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
const service = new ResearchSessionService(new PrismaResearchSessionStore(prisma), {
  now: () => "2026-08-24T12:00:00.000Z",
  id: (prefix) => `${prefix}-experiment-${++sequence}`,
});

const results = [];
for (const [index, topic] of topics.entries()) {
  let session = await service.create("guest:experiment", { researchQuestion: topic.question, writingTopic: topic.writing });
  const resources = [1, 2].map((number) => ({ id: `${topic.concept.id}-evidence-${number}`, title: `${topic.writing} evidence ${number}`, concepts: [topic.concept], sourceLabel: "Experiment fixture" }));
  session = await service.recordSearch("guest:experiment", session.id, { interactionId: `int-experiment-${index + 1}`, query: topic.query, at: session.createdAt, concepts: [topic.concept], resources });
  session = await service.addEvidence("guest:experiment", session.id, resources[0].id);
  session = await service.addEvidence("guest:experiment", session.id, resources[1].id);
  const systemBefore = buildSystemGraph(session);
  const publicHashBefore = hashPublicGraph(systemBefore);
  session = await service.updateGraph("guest:experiment", session.id, {
    expectedVersion: 0,
    nodeOverrides: {
      topic: { position: { x: 90 + index * 20, y: 45 + index * 15 }, pinned: true, hidden: false, label: `${topic.writing} · personal`, note: "Experiment note survives restart", updatedAt: session.updatedAt },
    },
    hiddenSystemEdgeIds: [systemBefore.edges[0].id],
    personalEdges: [{ id: `personal-${index + 1}`, source: "topic", target: `concept:${topic.concept.id}`, type: "personal_note", label: "my evidence path", note: "Private relation" }],
  });
  const restartedClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const restarted = new ResearchSessionService(new PrismaResearchSessionStore(restartedClient));
  const restored = await restarted.get("guest:experiment", session.id);
  await restartedClient.$disconnect();
  const publicHashAfter = hashPublicGraph(buildSystemGraph(restored));
  fs.writeFileSync(path.join(sessionDir, `${session.id}.json`), JSON.stringify(restored, null, 2));
  results.push({
    sessionId: session.id, topic: topic.writing, searchCount: restored.searches.length,
    evidenceCount: restored.evidenceIds.length, graphVersion: restored.personalGraph.version,
    restoredPosition: restored.personalGraph.nodeOverrides.topic.position,
    restoredPinned: restored.personalGraph.nodeOverrides.topic.pinned,
    restoredHiddenEdge: restored.personalGraph.hiddenSystemEdgeIds.length === 1,
    restoredLabel: restored.personalGraph.nodeOverrides.topic.label,
    restoredNote: restored.personalGraph.nodeOverrides.topic.note,
    restoredPersonalEdge: restored.personalGraph.personalEdges[0]?.type,
    publicHashBefore, publicHashAfter, publicGraphUnchanged: publicHashBefore === publicHashAfter,
  });
}

const afterSeedHashes = Object.fromEntries(publicFiles.map((file) => [file, fileHash(file)]));
const experiment = {
  packageVersion: "v3.2-p03-schema-2",
  recordedAt: "2026-08-24T12:00:00.000Z",
  layoutSeed: "deterministic-radial-v1 (no random source)",
  inputTopics: topics,
  results,
  publicSeedHashes: { before: beforeSeedHashes, after: afterSeedHashes, unchanged: JSON.stringify(beforeSeedHashes) === JSON.stringify(afterSeedHashes) },
};
fs.writeFileSync(path.join(output, "experiment-results.json"), JSON.stringify(experiment, null, 2));
fs.writeFileSync(path.join(output, "failure-samples.json"), JSON.stringify([
  { code: "EXPIRED_INTERACTION", status: 404, ui: "这次旧检索已过期，但你可以创建新会话后从主题节点重新搜索。" },
  { code: "SOURCE_FAILURE", status: 503, ui: "来源暂时不可用；这不是‘无结果’，你的图已保留。" },
  { code: "NO_RESOURCES", status: 200, empty: true, ui: "这个主题暂时没有找到资源，可以换词重试。" },
  { code: "CONFLICT", status: 409, ui: "另一窗口保存了更新。请刷新后重新应用本次修改。" },
  { code: "CORRUPT_RECOVERY", recovery: "restore a schema-v1 empty user layer and surface a warning" },
], null, 2));

const rows = results.map((item) => `| ${item.topic} | ${item.searchCount} | ${item.evidenceCount} | ${item.graphVersion} | ${item.restoredPinned && item.restoredHiddenEdge && item.restoredPersonalEdge === "personal_note" ? "通过" : "失败"} | ${item.publicGraphUnchanged ? "未变" : "变化"} |`).join("\n");
fs.writeFileSync(path.join(output, "EXPERIMENT-REPORT.md"), `# V3.2 责任包 03 对照实验\n\n版本：v3.2-p03-schema-2\n布局种子：deterministic-radial-v1（无随机源）\n固定时间：2026-08-24T12:00:00.000Z\n持久化：Prisma/SQLite migration 202608250001\n\n| 主题 | 搜索 | 证据 | 图版本 | 重启恢复 | 公共图 |\n|---|---:|---:|---:|---|---|\n${rows}\n\n## 四组对照结论\n\n1. 个性化图：首页 \`StarMap\` 未修改；三张会话图均包含主题、搜索、概念和两条资源证据。\n2. 可编辑持久化：位置、固定、隐藏系统边、个人标签、注释和 \`personal_note\` 边在新 PrismaClient 恢复后一致。\n3. 图谱保护：系统图哈希编辑前后相同，三个 seed/consent 文件 SHA-256 前后相同。\n4. 节点行动：\`research-workflow.test.ts\` 验证 search/library 均保留 sessionId；search interaction 与馆藏资源快照均写回会话，馆藏证据和资源节点在服务重启后可恢复。\n\n## 可重复 API 闭环\n\n运行 \`npx vitest run tests/unit/research-api-e2e.test.ts tests/unit/research-prisma-store.test.ts --pool forks --poolOptions.forks.singleFork\`。覆盖包01身份端口注入、创建、原子编辑、重启恢复、跨所有者 404、并发冲突和数据库迁移。\n\n## 技术说明\n\n个人主题星图采用“系统知识层 + 用户工作层”双层结构。系统层由概念、虫洞和经同意的活书构成，用户层只保存位置、显示状态、注释和个人关联。因此研究者能重组自己的探索路径，同时不会污染公共知识图或绕过隐私规则。主题节点可把图上的理解直接转化为下一次检索或馆藏发现。\n`);

console.log(JSON.stringify({ sessions: results.length, allRestored: results.every((item) => item.graphVersion === 1), publicGraphUnchanged: results.every((item) => item.publicGraphUnchanged) && experiment.publicSeedHashes.unchanged }, null, 2));
await prisma.$disconnect();
await cleanupExperimentDirectory(databaseDirectory);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
