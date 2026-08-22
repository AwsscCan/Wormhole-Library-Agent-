/**
 * Orchestrator smoke test（队友01）
 * 验收核心闭环：search -> wormholes -> feedback -> memory 变化。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LibraryAgentOrchestrator } from "@/lib/agent/orchestrator";
import { resetMemory } from "@/lib/mock/store";

const USER = "test-user";

describe("LibraryAgentOrchestrator full loop", () => {
  let orchestrator: LibraryAgentOrchestrator;

  beforeEach(() => {
    orchestrator = new LibraryAgentOrchestrator();
    resetMemory(USER);
  });

  it("search returns interactionId, concepts, and resources", async () => {
    const res = await orchestrator.search({
      userId: USER,
      query: "I want to learn AI Agent for a project",
    });
    expect(res.interactionId).toBeTruthy();
    expect(res.concepts.length).toBeGreaterThan(0);
    expect(res.concepts.map((c) => c.id)).toContain("c_ai_agent");
    expect(res.resources.length).toBeGreaterThan(0);
    // contract 字段完整性
    const r = res.resources[0];
    expect(r).toHaveProperty("title");
    expect(r).toHaveProperty("why");
    expect(r).toHaveProperty("availability");
    expect(r).toHaveProperty("difficulty");
  });

  it("search applies taskType and level to the integrated catalog ranking", async () => {
    const courseBeginner = await orchestrator.search({
      userId: USER,
      query: "AI Agent",
      taskType: "course",
      level: "beginner",
    });
    const researchExpert = await orchestrator.search({
      userId: USER,
      query: "AI Agent",
      taskType: "research",
      level: "research",
    });

    expect(courseBeginner.resources.map((resource) => resource.id)).not.toEqual(
      researchExpert.resources.map((resource) => resource.id),
    );
  });

  it("wormholes land on resources or living books, slider changes ranking", async () => {
    const search = await orchestrator.search({ userId: USER, query: "AI Agent" });

    const low = await orchestrator.wormholes({
      userId: USER,
      interactionId: search.interactionId,
      startConceptIds: ["c_ai_agent"],
      sliderValue: 10,
    });
    const high = await orchestrator.wormholes({
      userId: USER,
      interactionId: search.interactionId,
      startConceptIds: ["c_ai_agent"],
      sliderValue: 90,
    });

    for (const w of [...low.wormholes, ...high.wormholes]) {
      // 硬规则：每个虫洞必须有落点
      expect(w.resources.length + w.livingBooks.length).toBeGreaterThan(0);
      // 硬规则：路径可见（起点 + 至少 2 桥 = 长度 >= 3）
      expect(w.path.length).toBeGreaterThanOrEqual(3);
      expect(w.scores.bridge).toBeGreaterThanOrEqual(0.35);
    }

    // slider 必须影响排序：低/高意外度下 noveltyFit 分布应不同
    expect(high.wormholes.length).toBeGreaterThan(0);
    if (low.wormholes.length > 0 && high.wormholes.length > 0) {
      const lowTop = low.wormholes[0];
      const highTop = high.wormholes[0];
      const differs =
        lowTop.id !== highTop.id ||
        lowTop.scores.noveltyFit !== highTop.scores.noveltyFit;
      expect(differs).toBe(true);
    }
  });

  it("feedback 'too_hard' lowers math tolerance and memory reflects it", async () => {
    const search = await orchestrator.search({ userId: USER, query: "AI Agent" });
    const wh = await orchestrator.wormholes({
      userId: USER,
      interactionId: search.interactionId,
      startConceptIds: ["c_ai_agent"],
      sliderValue: 70,
    });
    expect(wh.wormholes.length).toBeGreaterThan(0);

    const before = (await orchestrator.memory(USER)).memory.difficulty.mathTolerance;
    const fb = await orchestrator.feedback({
      userId: USER,
      interactionId: search.interactionId,
      targetType: "wormhole",
      targetId: wh.wormholes[0].id,
      rating: "too_hard",
      freeText: "有意思但数学太难",
    });
    expect(fb.memoryPatches.length).toBeGreaterThan(0);

    const after = await orchestrator.memory(USER);
    expect(after.memory.difficulty.mathTolerance).toBeLessThan(before);
    expect(after.recentUpdates.length).toBeGreaterThan(0);
  });

  it("feedback 'too_close' raises default slider", async () => {
    const search = await orchestrator.search({ userId: USER, query: "AI Agent" });
    const before = (await orchestrator.memory(USER)).memory.serendipity.defaultSlider;
    await orchestrator.feedback({
      userId: USER,
      interactionId: search.interactionId,
      targetType: "wormhole",
      targetId: "any",
      rating: "too_close",
    });
    const after = (await orchestrator.memory(USER)).memory.serendipity.defaultSlider;
    expect(after).toBeGreaterThan(before);
  });

  it("matches are consent-safe and anonymous", async () => {
    const res = await orchestrator.matches({
      userId: USER,
      conceptIds: ["c_mechanism_design", "c_transformer"],
    });
    for (const m of res.matches) {
      expect(m.displayMode).toBe("anonymous");
      expect(m.contactState).toBe("request_required");
      // consentState=private 的 lb_private_example 绑定了 c_transformer，绝不能出现
      expect(m.id).not.toContain("lb_private_example");
    }
  });

  it("reset memory restores defaults", async () => {
    const search = await orchestrator.search({ userId: USER, query: "AI Agent" });
    await orchestrator.feedback({
      userId: USER,
      interactionId: search.interactionId,
      targetType: "wormhole",
      targetId: "any",
      rating: "too_hard",
    });
    const reset = await orchestrator.resetMemory(USER);
    expect(reset.memory.difficulty.mathTolerance).toBe(0.5);
    expect(reset.recentUpdates.length).toBe(0);
  });
});
