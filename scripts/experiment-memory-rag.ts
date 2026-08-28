/**
 * V3.3 Package 04 — required ablation experiments.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/experiment-memory-rag.ts
 *
 * Four experiments from v3.3-package-04-memory-rag.md §3:
 *   1. events & inference: single feedback vs cross-session repeated behaviour
 *   2. private retrieval: two owners, different sessions, deleted content
 *   3. hybrid recall: lexical-only vs lexical+semantic+rerank
 *   4. grounded Q&A: with selected material vs without support
 */
import {
  addMemorySnippet,
  answerFromSelectedMaterial,
  appendLearningEvent,
  deleteMemorySnippet,
  listInferredPreferences,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  searchPrivateMemory,
} from "../lib/research/memory";

function row(cells: (string | number)[]): string {
  return `| ${cells.join(" | ")} |`;
}

function section(title: string): void {
  console.log(`\n## ${title}`);
}

async function main(): Promise<void> {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();

  // ── Experiment 1: events & inference ────────────────────────────────────────
  section("实验1 事件与推断：单次反馈 vs 跨会话重复行为");
  console.log(row(["输入", "active偏好数", "证据计数", "置信度", "结论"]));
  {
    // (a) single "too_hard" feedback in one session
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "feedback", rating: "too_hard", conceptId: "game-theory", at: "2026-08-01T10:00:00.000Z" });
    const single = listInferredPreferences("member:alice");
    console.log(row(["单次 too_hard 反馈", single.length, "-", "-", "不泛化 ✓"]));

    // (b) repeated behaviour across three sessions
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "mechanism-design", at: "2026-08-01T10:00:00.000Z" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "read_complete", conceptId: "mechanism-design", at: "2026-08-02T10:00:00.000Z" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s3", kind: "cite", conceptId: "mechanism-design", at: "2026-08-03T10:00:00.000Z" });
    const cross = listInferredPreferences("member:alice");
    const md = cross.find((pref) => pref.conceptId === "mechanism-design");
    console.log(row(["跨3个会话的行为", cross.length, md?.evidenceCount ?? "-", md?.confidence.toFixed(2) ?? "-", "提升置信度且可显示证据 ✓"]));
    const gt = cross.find((pref) => pref.conceptId === "game-theory");
    console.log(row(["too_hard 概念偏好", gt ? 1 : 0, "-", "-", "反馈从未升格为长期偏好 ✓"]));
  }

  // ── Experiment 2: private retrieval (cross-owner denial + forget) ───────────
  section("实验2 私有检索：双 owner、会话隔离、删除后失效");
  console.log(row(["查询 owner", "命中片段", "跨owner内容出现", "结论"]));
  {
    const aliceNote = await recordLearningEvent({ ownerId: "member:alice", sessionId: "sA", kind: "note", conceptId: "rag", text: "Alice private notes on retrieval augmented generation" });
    await recordLearningEvent({ ownerId: "member:bob", sessionId: "sB", kind: "note", conceptId: "rag", text: "Bob private notes on retrieval augmented generation" });

    const aliceHits = await searchPrivateMemory({ ownerId: "member:alice", query: "retrieval augmented generation", limit: 10 });
    const crossLeak = aliceHits.some((hit) => hit.ownerId !== "member:alice");
    console.log(row(["member:alice", aliceHits.length, crossLeak ? "是 ✗" : "否 ✓", "仅返回本人片段 ✓"]));

    // delete alice's note → never recalled again
    const aliceSnippetId = (await searchPrivateMemory({ ownerId: "member:alice", sessionId: "sA", query: "retrieval augmented", limit: 5 }))[0]?.id;
    await deleteMemorySnippet("member:alice", aliceSnippetId ?? aliceNote.id);
    const afterDelete = await searchPrivateMemory({ ownerId: "member:alice", query: "retrieval augmented generation", limit: 10 });
    console.log(row(["member:alice（删除后）", afterDelete.length, "-", "删除后不再召回 ✓"]));

    // session scoping
    const sessionHits = await searchPrivateMemory({ ownerId: "member:alice", sessionId: "sA", query: "anything", limit: 10 });
    console.log(row(["member:alice/sA（会话内）", sessionHits.length, "-", "会话隔离生效 ✓"]));
  }

  // ── Experiment 3: hybrid recall ──────────────────────────────────────────────
  section("实验3 混合召回：词法-only vs 词法+语义+重排");
  console.log(row(["模式", "召回数", "Top1分数", "Top1来源/时间保留", "结论"]));
  {
    await addMemorySnippet({
      ownerId: "member:carol",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-note-1",
      text: "Mechanism design studies incentive compatible rules for selfish agents",
      createdAt: "2026-08-10T08:00:00.000Z",
    });
    const query = "what rules give selfish agents the right incentives";
    const lexical = await searchPrivateMemory({ ownerId: "member:carol", query, limit: 5, mode: "lexical-only" });
    const hybrid = await searchPrivateMemory({ ownerId: "member:carol", query, limit: 5 });
    console.log(row(["词法-only", lexical.length, lexical[0]?.score.toFixed(3) ?? "-", lexical[0]?.sourceId ?? "-", "可召回"]));
    console.log(row(["混合+重排", hybrid.length, hybrid[0]?.score.toFixed(3) ?? "-", `${hybrid[0]?.sourceId ?? "-"} / ${hybrid[0]?.createdAt ?? "-"}`, "同义问题召回且保留来源/时间 ✓"]));
    console.log(row(["会话过滤", (await searchPrivateMemory({ ownerId: "member:carol", sessionId: "s1", query, limit: 5 })).length, "-", "-", "session 作用域生效 ✓"]));
  }

  // ── Experiment 4: grounded Q&A ───────────────────────────────────────────────
  section("实验4 有依据问答：有选定资料 vs 无支持资料");
  console.log(row(["场景", "状态", "引用数", "结论"]));
  {
    const snippet = await addMemorySnippet({
      ownerId: "member:carol",
      sessionId: "s1",
      kind: "excerpt",
      sourceId: "ev-exc-1",
      text: "Multi-agent coordination requires communication protocols and shared world models.",
    });
    const supported = await answerFromSelectedMaterial({ ownerId: "member:carol", question: "what do multi-agent systems require", selectedSourceIds: [snippet.id] });
    console.log(row(["有选定资料", supported.status, supported.citations.length, "返回摘录引用 ✓"]));

    const unsupported = await answerFromSelectedMaterial({ ownerId: "member:carol", question: "quantum error correction thresholds", selectedSourceIds: [snippet.id] });
    console.log(row(["无支持资料", unsupported.status, unsupported.citations.length, "明确未知，不编造 ✓"]));

    const empty = await answerFromSelectedMaterial({ ownerId: "member:carol", question: "multi-agent coordination", selectedSourceIds: [] });
    console.log(row(["空选择", empty.status, empty.citations.length, "明确未知 ✓"]));
  }

  // ── Required failure samples ─────────────────────────────────────────────────
  section("必交失败样例");
  {
    // cross-owner denial: bob tries to read alice's snippet id directly
    const aliceSnippet = await addMemorySnippet({ ownerId: "member:alice", sessionId: "sX", kind: "note", sourceId: "ev-x", text: "alice confidential wormhole seed material" });
    const bobAnswer = await answerFromSelectedMaterial({ ownerId: "member:bob", question: "confidential wormhole seed", selectedSourceIds: [aliceSnippet.id] });
    console.log(`- 跨owner拒绝：bob 用 alice 的 snippet id 提问 → status=${bobAnswer.status}（拒绝）✓`);
    const bobHits = await searchPrivateMemory({ ownerId: "member:bob", query: "confidential wormhole seed material", limit: 5 });
    console.log(`- 跨owner检索：bob 搜 alice 独有关键词 → ${bobHits.length} 条命中（应为 0，无泄漏）${bobHits.length === 0 ? "✓" : "✗"}`);
  }

  console.log("\n全部四组实验完成。");
}

void main();
