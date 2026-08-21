/**
 * API contract 测试（队友01）
 * 直接调用 route handler（Request → Response），校验冻结的响应结构。
 */
import { describe, expect, it } from "vitest";
import { POST as searchPOST } from "@/app/api/search/route";
import { POST as wormholesPOST } from "@/app/api/wormholes/route";
import { POST as feedbackPOST } from "@/app/api/feedback/route";
import { GET as memoryGET } from "@/app/api/memory/route";
import { POST as matchesPOST } from "@/app/api/matches/route";
import { POST as contactPOST } from "@/app/api/contact-requests/route";
import { POST as reviewPOST } from "@/app/api/review/route";

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API contracts", () => {
  it("POST /api/search returns frozen SearchResponse shape", async () => {
    const res = await searchPOST(
      jsonRequest("http://test/api/search", {
        userId: "contract-user",
        query: "AI Agent",
        taskType: "project",
        level: "beginner",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("interactionId");
    expect(Array.isArray(data.concepts)).toBe(true);
    expect(Array.isArray(data.resources)).toBe(true);
    expect(Array.isArray(data.readingPath)).toBe(true);
    expect(Array.isArray(data.memoryUsed)).toBe(true);
  });

  it("POST /api/search rejects bad body with frozen error shape", async () => {
    const res = await searchPOST(jsonRequest("http://test/api/search", { query: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toHaveProperty("code", "BAD_REQUEST");
    expect(data.error).toHaveProperty("message");
  });

  it("POST /api/wormholes returns wormholes with paths and scores", async () => {
    const searchRes = await searchPOST(
      jsonRequest("http://test/api/search", { userId: "contract-user", query: "AI Agent" }),
    );
    const { interactionId } = await searchRes.json();

    const res = await wormholesPOST(
      jsonRequest("http://test/api/wormholes", {
        userId: "contract-user",
        interactionId,
        startConceptIds: ["c_ai_agent"],
        sliderValue: 70,
        maxPaths: 3,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.wormholes)).toBe(true);
    for (const w of data.wormholes) {
      expect(Array.isArray(w.path)).toBe(true);
      expect(w.scores).toHaveProperty("novelty");
      expect(w.scores).toHaveProperty("bridge");
      expect(w.scores).toHaveProperty("final");
      expect(w).toHaveProperty("explanation");
    }
  });

  it("POST /api/feedback returns memoryPatches + memorySummary; GET /api/memory reflects it", async () => {
    const searchRes = await searchPOST(
      jsonRequest("http://test/api/search", { userId: "contract-user-2", query: "AI Agent" }),
    );
    const { interactionId } = await searchRes.json();

    const fbRes = await feedbackPOST(
      jsonRequest("http://test/api/feedback", {
        userId: "contract-user-2",
        interactionId,
        targetType: "wormhole",
        targetId: "wh_x",
        rating: "too_hard",
      }),
    );
    expect(fbRes.status).toBe(200);
    const fb = await fbRes.json();
    expect(Array.isArray(fb.memoryPatches)).toBe(true);
    expect(fb.memorySummary).toHaveProperty("difficulty");

    const memRes = await memoryGET(
      new Request("http://test/api/memory?userId=contract-user-2"),
    );
    expect(memRes.status).toBe(200);
    const mem = await memRes.json();
    expect(mem.memory.difficulty.mathTolerance).toBeLessThan(0.5);
  });

  it("POST /api/matches returns consent-safe matches", async () => {
    const res = await matchesPOST(
      jsonRequest("http://test/api/matches", {
        userId: "contract-user",
        conceptIds: ["c_mechanism_design"],
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.matches)).toBe(true);
    for (const m of data.matches) {
      expect(m.displayMode).toBe("anonymous");
      expect(m).toHaveProperty("headline");
      expect(m).toHaveProperty("bridge");
    }
  });

  it("POST /api/contact-requests stores a pending request", async () => {
    const res = await contactPOST(
      jsonRequest("http://test/api/contact-requests", {
        userId: "contract-user",
        personMatchId: "pm_x",
        message: "15 min chat?",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("requestId");
    expect(data.status).toBe("pending");
  });

  it("POST /api/review synthesizes three selected resources with a labeled fallback source", async () => {
    const paperIds = ["r_aima", "r_multiagent_systems", "r_game_theory_intro"];
    const res = await reviewPOST(
      jsonRequest("http://test/api/review", {
        userId: "contract-user",
        paperIds,
        focus: "methods",
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.papersUsed).toEqual(paperIds);
    expect(data.reviewText).toContain("Multiagent Systems");
    expect(data.source).toBe("concat");
  });
});
