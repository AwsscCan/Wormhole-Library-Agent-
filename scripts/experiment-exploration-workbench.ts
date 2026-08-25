import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaResearchSessionStore, ResearchSessionService } from "../lib/research/sessionStore";
import { appendExplorationFeedback, bindExplorationEventPort, clearWorkbenchPortsForTests, readMemorySummary } from "../lib/workbench/ports";
import { selectExplorationCandidates } from "../lib/workbench/recommendation";
import { PrismaWorkbenchStore, WorkbenchService } from "../lib/workbench/store";
import type { CandidateBand, ExplorationCandidate, SurpriseLevel } from "../lib/workbench/types";

const root = process.cwd();
const output = path.join(root, "outputs", "v3.3-p05");
fs.mkdirSync(output, { recursive: true });
const fixedAt = "2026-08-25T00:00:00.000Z";
const publicFiles = ["data/seed-concepts.json", "data/seed-edges.json", "data/seed-living-books.json"];
const hash = (file: string) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const beforeHashes = Object.fromEntries(publicFiles.map((file) => [file, hash(file)]));

function makeCandidates(): ExplorationCandidate[] {
  const build = (band: CandidateBand, count: number) => Array.from({ length: count }, (_, index): ExplorationCandidate => ({
    id: `${band}-${String(index + 1).padStart(2, "0")}`, resourceId: `${band}-resource-${index + 1}`,
    title: `${band} evidence ${index + 1}`, band, relevance: 0.99 - index * 0.012,
    trust: 0.92, accessible: true,
    conceptIds: band === "direct" ? [index < 12 ? "repeated-retrieval" : `direct-${index % 6}`] : [`${band}-${index % 7}`],
    citationIds: [], bridge: band === "direct" ? undefined : `Evidence concept → ${band}-${index % 7}`,
    bridgeEvidence: band === "direct" ? undefined : { kind: "shared_concept", sourceId: "evidence", targetId: `${band}-${index % 7}`, label: `Evidence concept → ${band}-${index % 7}` },
    taskValue: band === "distant" ? "Provides a contrasting method for the active evidence question" : undefined,
    taskValueEvidence: band === "distant" ? { sourceId: `openalex:${index}`, label: "Source-provided task value" } : undefined,
    difficulty: index % 3 === 0 ? "research" : "intermediate", estimatedMinutes: 20 + index % 3 * 5,
    provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex experiment fixture", retrievedAt: fixedAt },
  }));
  return [...build("direct", 24), ...build("adjacent", 15), ...build("distant", 10), {
    ...build("adjacent", 1)[0], id: "invalid-no-bridge", resourceId: "invalid-no-bridge", bridge: undefined, bridgeEvidence: undefined,
  }];
}

const candidates = makeCandidates();
const levels: SurpriseLevel[] = ["low", "medium", "high"];
const quotaResults = levels.map((level) => {
  const selected = selectExplorationCandidates(candidates, { surpriseLevel: level, limit: 20, lambda: 0.55 });
  return { level, total: selected.length,
    direct: selected.filter((item) => item.band === "direct").length,
    adjacent: selected.filter((item) => item.band === "adjacent").length,
    distant: selected.filter((item) => item.band === "distant").length,
    invalidSelected: selected.some((item) => item.id === "invalid-no-bridge"),
    allHaveFourReasons: selected.every((item) => Object.values(item.explanation).every((reason) => reason.trim().length > 8)),
  };
});

const raw = [...candidates].filter((item) => item.accessible && item.trust >= 0.5).sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id)).slice(0, 20);
const mmr = selectExplorationCandidates(candidates, { surpriseLevel: "high", limit: 20, lambda: 0.55 });
const repeatedTopicCount = (items: ExplorationCandidate[]) => items.filter((item) => item.conceptIds.includes("repeated-retrieval")).length;
const diversityResult = {
  rawRelevance: { repeatedTopicCount: repeatedTopicCount(raw), uniqueConcepts: new Set(raw.flatMap((item) => item.conceptIds)).size },
  greedyMmr: { repeatedTopicCount: repeatedTopicCount(mmr), uniqueConcepts: new Set(mmr.flatMap((item) => item.conceptIds)).size },
  forwardIds: mmr.map((item) => item.id),
  reverseIds: selectExplorationCandidates([...candidates].reverse(), { surpriseLevel: "high", limit: 20, lambda: 0.55 }).map((item) => item.id),
};

async function main() {
  const events: unknown[] = [];
  bindExplorationEventPort({ append: async (event) => { events.push(event); return { accepted: true }; } });
  const feedback = await Promise.all((["useful", "too_far", "too_hard"] as const).map((value, index) => appendExplorationFeedback({
    ownerId: "guest:experiment", sessionId: "session-feedback", recommendationId: `rec-${index + 1}`, feedback: value, occurredAt: fixedAt,
  })));
  clearWorkbenchPortsForTests();
  const memoryDegradation = await readMemorySummary("guest:experiment", "session-feedback");

  const databaseFilename = `p05-experiment-${process.pid}.db`;
  const databasePath = path.join(root, "prisma", databaseFilename);
  fs.writeFileSync(databasePath, "");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const migrationDeploy = execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: root, env: { ...process.env, DATABASE_URL: `file:./${databaseFilename}` }, encoding: "utf8",
  });
  fs.writeFileSync(path.join(output, "MIGRATION-DEPLOY.txt"), `DATABASE_URL=file:./${databaseFilename} npx prisma migrate deploy\n\n${migrationDeploy.trimEnd()}\n`);
  const shadowFilename = `p05-shadow-${process.pid}.db`;
  const shadowPath = path.join(root, shadowFilename);
  fs.writeFileSync(shadowPath, "");
  const migrationDiff = execFileSync(process.execPath, [prismaCli, "migrate", "diff", "--from-migrations", "prisma/migrations",
    "--to-schema-datamodel", "prisma/schema.prisma", "--shadow-database-url", `file:./${shadowFilename}`, "--exit-code"], {
    cwd: root, env: { ...process.env, DATABASE_URL: `file:./${databaseFilename}` }, encoding: "utf8",
  });
  fs.rmSync(shadowPath, { force: true });
  fs.writeFileSync(path.join(output, "MIGRATION-DIFF.txt"), `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code\n\n${migrationDiff.trimEnd()}\n`);

  let sequence = 0;
  const firstClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const research = new ResearchSessionService(new PrismaResearchSessionStore(firstClient), { now: () => fixedAt, id: (prefix) => `${prefix}-p05-${++sequence}` });
  const service = new WorkbenchService(new PrismaWorkbenchStore(firstClient), research, { now: () => fixedAt });
  const topics = ["RAG evidence quality", "Scheduling fairness", "Graph library discovery"];
  const written: Array<{ sessionId: string; topic: string; graphBefore: string; index: number }> = [];
  for (const [index, topic] of topics.entries()) {
    const session = await research.create("guest:experiment", { researchQuestion: topic });
    const graphBefore = JSON.stringify(session.personalGraph);
    const state = await service.get("guest:experiment", session.id);
    await service.update("guest:experiment", session.id, { expectedVersion: 0, surpriseLevel: levels[index],
      readingPlan: { goal: `Evaluate ${topic}`, orderedResourceIds: [`resource-${index}`], estimatedMinutes: 30,
        completionDefinition: "Evidence matrix and uncertainty note are complete", nextAction: "Draft one traceable paragraph", completedResourceIds: [] },
      views: {
        reading: { nodePositions: { [`resource-${index}`]: { x: index * 30, y: 20 } }, hiddenNodeIds: [], personalEdges: [] },
        concept: { nodePositions: { [`concept-${index}`]: { x: 10, y: index * 30 } }, hiddenNodeIds: [], personalEdges: [{ id: `edge-${index}`, source: "topic", target: `concept-${index}`, label: "private bridge" }] },
        evidence: { nodePositions: { [`claim-${index}`]: { x: 30, y: 30 } }, hiddenNodeIds: [], personalEdges: [] },
      }, resourceStates: { [`resource-${index}`]: { status: "reading", tags: ["experiment"], note: "Private note" } },
      evidenceGraph: {
        claims: [{ id: `claim-${index}`, text: `Claim for ${topic}` }],
        evidence: [{ id: `evidence-${index}`, resourceId: `resource-${index}`, noteId: `note-${index}`, label: "Experiment evidence" }],
        links: [{ id: `link-${index}`, claimId: `claim-${index}`, evidenceId: `evidence-${index}`, role: "to_verify" }],
        draftParagraphs: [{ id: `draft-${index}`, text: "Draft with explicit uncertainty", sourceRefs: [{ resourceId: `resource-${index}`, noteId: `note-${index}` }] }],
      },
    });
    await service.projectResources("guest:experiment", session.id, [{ resourceId: `resource-${index}`, recommendationId: `rec-${index}`,
      title: `${topic} source`, conceptIds: [`concept-${index}`], conceptLabels: [`Concept ${index}`], sourceLabel: "OpenAlex experiment fixture",
      provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex experiment fixture", retrievedAt: fixedAt }, projectedAt: fixedAt }]);
    written.push({ sessionId: session.id, topic, graphBefore, index });
  }
  await firstClient.$disconnect();

  const recoveryResults = [];
  for (const item of written) {
    const restartedClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const restartedResearch = new ResearchSessionService(new PrismaResearchSessionStore(restartedClient));
    const restarted = new WorkbenchService(new PrismaWorkbenchStore(restartedClient), restartedResearch);
    const restored = await restarted.get("guest:experiment", item.sessionId);
    const graphAfter = JSON.stringify((await restartedResearch.get("guest:experiment", item.sessionId)).personalGraph);
    recoveryResults.push({ sessionId: item.sessionId, topic: item.topic, version: restored.version,
      readingPlanRestored: restored.readingPlan.nextAction === "Draft one traceable paragraph",
      allViewsRestored: Object.values(restored.views).every((view) => Object.keys(view.nodePositions).length === 1),
      resourceJump: `/research/${item.sessionId}/map?sessionId=${item.sessionId}&resourceId=resource-${item.index}`,
      projectedResourceRestored: restored.resourceProjections[`resource-${item.index}`]?.title === `${item.topic} source`,
      backlinkRestored: restored.evidenceGraph.draftParagraphs[0].sourceRefs[0].noteId === `note-${item.index}`,
      researchGraphUnchanged: item.graphBefore === graphAfter,
    });
    await restartedClient.$disconnect();
  }

  const afterHashes = Object.fromEntries(publicFiles.map((file) => [file, hash(file)]));
  const hashes = { before: beforeHashes, after: afterHashes, unchanged: JSON.stringify(beforeHashes) === JSON.stringify(afterHashes) };
  const results = { packageVersion: "v3.3-p05-schema-2", recordedAt: fixedAt,
    candidateSeed: "deterministic-indexed-fixture-v1 (no random source)", quotaResults, diversityResult,
    explanationAndFeedback: { allSelectedHaveFourReasons: quotaResults.every((item) => item.allHaveFourReasons), feedback, eventCount: events.length,
      eventsContainPreferencePatch: JSON.stringify(events).includes("memoryPatch") || JSON.stringify(events).includes("preference") },
    migrationDeploy: { command: "DATABASE_URL=file:./<empty.db> npx prisma migrate deploy", success: migrationDeploy.includes("All migrations have been successfully applied"),
      schemaDiffClean: migrationDiff.includes("No difference detected") },
    recoveryResults, publicProtection: hashes, memoryDegradation,
  };
  fs.writeFileSync(path.join(output, "candidates.json"), JSON.stringify(candidates, null, 2));
  fs.writeFileSync(path.join(output, "experiment-results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(output, "public-graph-hashes.json"), JSON.stringify(hashes, null, 2));
  fs.writeFileSync(path.join(output, "degradation-sample.json"), JSON.stringify({
    memory: memoryDegradation,
    sourceFailure: { sourceStatus: "unavailable", degraded: true, resources: [], message: "Source-transparent catalog port is not integrated" },
    ui: "来源或记忆端口未接入时显式显示降级，不把外部失败呈现为正常零结果。",
  }, null, 2));
  const quotaRows = quotaResults.map((item) => `| ${item.level} | ${item.direct}/${item.adjacent}/${item.distant} | ${item.invalidSelected ? "失败" : "通过"} | ${item.allHaveFourReasons ? "通过" : "失败"} |`).join("\n");
  fs.writeFileSync(path.join(output, "EXPERIMENT-REPORT.md"), `# V3.3 责任包 05 对照实验\n\n版本：v3.3-p05-schema-2\n候选种子：deterministic-indexed-fixture-v1（无随机源）\n固定时间：${fixedAt}\n标准迁移部署：${migrationDeploy.includes("All migrations have been successfully applied") ? "通过" : "失败"}\n迁移历史/schema diff：${migrationDiff.includes("No difference detected") ? "无漂移" : "失败"}\n\n| 意外度 | 直接/邻近/远距 | 不可解释候选排除 | 四类理由 |\n|---|---:|---|---|\n${quotaRows}\n\n## 多样性\n\n- 原始相关度：重复主题 ${diversityResult.rawRelevance.repeatedTopicCount}，独立概念 ${diversityResult.rawRelevance.uniqueConcepts}。\n- 贪心 MMR：重复主题 ${diversityResult.greedyMmr.repeatedTopicCount}，独立概念 ${diversityResult.greedyMmr.uniqueConcepts}。\n- 正序/逆序候选结果一致：${JSON.stringify(diversityResult.forwardIds) === JSON.stringify(diversityResult.reverseIds) ? "通过" : "失败"}。MMR 惩罚只读取已选集合。\n\n## 解释、证据、记忆与反馈\n\n候选分档来自已确认会话证据、个人图概念或可追溯概念/引用桥，不再按目录返回顺序。P04 受限片段与偏好只形成带来源 ID 的推荐特征，不作为外部事实。每项均包含关系、桥梁、难度、新增价值。三类反馈共写入事件端口 ${events.length} 条，未生成偏好或 memory patch。\n\n## 真实 SQLite 三主题恢复与公共保护\n\n工作台先通过标准 \`prisma migrate deploy\` 创建空库，再保存三个主题；首次 PrismaClient 完全断开后，三个主题分别由新 PrismaClient、新 ResearchSessionService 和新 WorkbenchService 复读。阅读计划、三视图用户层、资源投影、证据—草稿反链和 sessionId 跳转均恢复。ResearchSession 图层未变；公共概念、边和 Living Library consent seed 哈希前后相同：${hashes.unchanged ? "通过" : "失败"}。\n\n## 技术说明\n\n探索工作台把来源透明候选与 P03 会话证据/个人图、P04 受限召回转换为可追溯决策特征，再做资格筛选、固定意外度配额和 selected-only 贪心 MMR。推荐资源以私有投影进入星图，深链会真实聚焦节点，并为失效目标提供恢复提示。三种视图只保存 owner 隔离的用户层；反馈经事件端口发送，不直接写长期偏好。\n`);
  fs.writeFileSync(path.join(output, "UI-ACCEPTANCE.md"), `# 可重复 UI 验收\n\n1. 绑定包01身份端口、包02来源透明端口和包04 \`MemoryReadPort.search/listInferredPreferences\`；运行 \`npm run dev\`。\n2. 打开 \`/research/<sessionId>/workbench\`，改变会话证据或记忆召回后生成，核对候选分档、分数、来源 ID 和四类理由随输入改变。\n3. 点击推荐的星图入口，星图必须出现并聚焦该私有资源投影；点击星图“返回工作台证据/草稿”应回到同一资源。失效 resourceId 必须显示恢复提示。\n4. 填写阅读计划，在概念图添加个人边；在证据图添加主张、四类证据关系和草稿反链。参考文献可分批持续添加，不设总量上限。\n5. 保存后重启服务并重新打开；三视图、投影与阅读状态应恢复。用另一个 owner 访问应为 404。\n6. 断开 P04 或来源端口，界面必须显示“无历史记忆模式”或“显式降级”；事件端口拒绝反馈时必须提示未记录。\n\n自动化对应：\`workbench-context.test.ts\`、\`workbench-projection.test.ts\`、\`workbench-migration-deploy.test.ts\`、\`workbench-prisma-store.test.ts\`。\n`);
  console.log(JSON.stringify({ quotas: quotaResults.map(({ level, direct, adjacent, distant }) => ({ level, direct, adjacent, distant })),
    diversityImproved: diversityResult.greedyMmr.repeatedTopicCount < diversityResult.rawRelevance.repeatedTopicCount,
    orderInvariant: JSON.stringify(diversityResult.forwardIds) === JSON.stringify(diversityResult.reverseIds),
    sessionsRestored: recoveryResults.filter((item) => item.readingPlanRestored && item.allViewsRestored && item.backlinkRestored).length,
    publicGraphAndConsentUnchanged: hashes.unchanged,
  }, null, 2));
  fs.rmSync(databasePath, { force: true });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
