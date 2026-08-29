import { describe, expect, it } from "vitest";
import type { ResearchSession, SourceTransparentResource } from "@/lib/research/types";
import { buildRecommendationResult } from "@/lib/workbench/runtime";
import type { MemorySummaryResult } from "@/lib/workbench/ports";

function session(evidenceIds: string[]): ResearchSession {
  return { id: "session-context", ownerId: "member:alice", researchQuestion: "How should retrieval evidence be calibrated?",
    interactionIds: ["i1"], evidenceIds, wormholes: [{ id: "w1", label: "Calibration", conceptIds: ["calibration"] }],
    searches: [{ interactionId: "i1", query: "retrieval evidence", at: "2026-08-25T00:00:00.000Z",
      concepts: [{ id: "retrieval", name: "Retrieval" }], resources: [{ id: "confirmed-paper", title: "Confirmed evidence", concepts: [{ id: "calibration", name: "Calibration" }] }] }],
    personalGraph: { schemaVersion: 1, version: 1, nodeOverrides: { "concept:calibration": { note: "Compare calibration", updatedAt: "2026-08-25T00:00:00.000Z" } }, hiddenSystemEdgeIds: [], personalEdges: [] },
    revision: 0, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" };
}

const resources: SourceTransparentResource[] = [
  { id: "candidate-calibration", type: "paper", title: "Calibration methods", authors: [], language: "en", why: "Tests calibration methods",
    availability: "online", difficulty: "research", concepts: [{ id: "calibration", name: "Calibration" }], qualityScore: 0.7,
    provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z", externalId: "oa:calibration" } },
  { id: "candidate-bayesian", type: "paper", title: "Bayesian uncertainty", authors: [], language: "en", why: "Contrasts uncertainty estimates",
    availability: "online", difficulty: "research", concepts: [{ id: "bayesian", name: "Bayesian calibration" }], qualityScore: 0.7,
    provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z", externalId: "oa:bayesian" } },
  { id: "candidate-wormhole", type: "paper", title: "Causal discovery", authors: [], language: "en", why: "Tests a causal alternative",
    availability: "online", difficulty: "research", concepts: [{ id: "causal", name: "Causal inference" }], qualityScore: 0.8,
    provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z", externalId: "oa:causal" } },
];
const catalog = { resources, sourceStatus: "live" as const, degraded: false };
const noMemory: MemorySummaryResult = { status: "unavailable", snippets: [], preferences: [], message: "Memory port unavailable" };

describe("session evidence and package 04 memory in recommendation decisions", () => {
  it("changes the candidate band and trace when confirmed evidence changes", () => {
    const without = buildRecommendationResult(session([]), catalog, noMemory, { surpriseLevel: "medium", limit: 10 });
    const withEvidence = buildRecommendationResult(session(["confirmed-paper"]), catalog, noMemory, { surpriseLevel: "medium", limit: 10 });
    const before = without.candidates.find((item) => item.resourceId === "candidate-calibration");
    const after = withEvidence.candidates.find((item) => item.resourceId === "candidate-calibration");
    expect(before?.band).not.toBe("direct");
    expect(after).toMatchObject({ band: "direct", decisionTrace: { sessionEvidenceIds: ["confirmed-paper"] } });
    expect(after!.effectiveRelevance!).toBeGreaterThan(before!.effectiveRelevance!);
  });

  it("uses bounded memory snippets to change eligibility and exposes their source ids", () => {
    const memory: MemorySummaryResult = { status: "available", snippets: [{ id: "snippet-bayes", sourceId: "note-bayes", sessionId: "session-context",
      createdAt: "2026-08-24T00:00:00.000Z", text: "Bayesian calibration uncertainty" }], preferences: [] };
    const without = buildRecommendationResult(session([]), catalog, noMemory, { surpriseLevel: "high", limit: 10 });
    const withMemory = buildRecommendationResult(session([]), catalog, memory, { surpriseLevel: "high", limit: 10 });
    const before = without.candidates.find((item) => item.resourceId === "candidate-bayesian")!;
    const after = withMemory.candidates.find((item) => item.resourceId === "candidate-bayesian")!;
    expect(after.effectiveRelevance!).toBeGreaterThan(before.effectiveRelevance!);
    expect(after.decisionTrace!.memorySnippetIds).toEqual(["snippet-bayes"]);
    expect(after.explanationContext).toContain("note-bayes");
    const beforeRecommendation = without.recommendations.find((item) => item.resourceId === "candidate-calibration")!;
    const afterRecommendation = withMemory.recommendations.find((item) => item.resourceId === "candidate-calibration")!;
    expect(afterRecommendation.mmrScore).toBeGreaterThan(beforeRecommendation.mmrScore);
    expect(afterRecommendation.explanation.relationship).toContain("snippet-bayes");
  });

  it("uses a P03 wormhole as a production-reachable distant bridge", () => {
    const withWormhole = session([]);
    withWormhole.wormholes = [{ id: "wormhole-causal", label: "Causal alternative", conceptIds: ["causal"] }];
    const candidate = buildRecommendationResult(withWormhole, catalog, noMemory, { surpriseLevel: "high", limit: 20 })
      .candidates.find((item) => item.resourceId === "candidate-wormhole");
    expect(candidate).toMatchObject({ band: "distant", bridgeEvidence: { sourceId: "wormhole-causal", kind: "shared_concept" },
      taskValueEvidence: { sourceId: "oa:causal" }, decisionTrace: { sessionContextIds: ["wormhole-causal"] } });
  });

  it("keeps real catalog results recommendable when a provider has no local concept tags", () => {
    const untagged = { resources: [{ ...resources[0], id: "untagged", title: "Retrieval evidence calibration for language models", why: "Evaluates retrieval evidence calibration methods", concepts: [] }], sourceStatus: "live" as const, degraded: false };
    const result = buildRecommendationResult(session([]), untagged, noMemory, { surpriseLevel: "medium", limit: 3 });
    expect(result.candidates[0]).toMatchObject({ band: "direct", directMatch: "query" });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.explanation.relationship).toContain("title/abstract match");
  });
});
