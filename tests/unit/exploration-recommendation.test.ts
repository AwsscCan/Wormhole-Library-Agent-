import { describe, expect, it } from "vitest";
import {
  explainCandidate,
  filterEligibleCandidates,
  selectExplorationCandidates,
} from "@/lib/workbench/recommendation";
import type { ExplorationCandidate } from "@/lib/workbench/types";

function candidates(): ExplorationCandidate[] {
  const make = (band: ExplorationCandidate["band"], count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${band}-${String(index + 1).padStart(2, "0")}`,
    resourceId: `${band}-resource-${index + 1}`,
    title: `${band} resource ${index + 1}`,
    band,
    relevance: 1 - index * 0.01,
    trust: 0.9,
    accessible: true,
    conceptIds: band === "direct" ? [`core-${index % 3}`] : [`explore-${index % 5}`],
    citationIds: [],
    bridge: band === "direct" ? undefined : `Connects through bridge-${index % 4}`,
    bridgeEvidence: band === "direct" ? undefined : { kind: "shared_concept" as const, sourceId: `core-${index % 3}`, targetId: `explore-${index % 5}`, label: `Verified concept bridge ${index % 4}` },
    taskValue: band === "distant" ? "Offers a contrasting method for the current question" : undefined,
    taskValueEvidence: band === "distant" ? { sourceId: `source-${index}`, label: "Source-provided task value" } : undefined,
    difficulty: "intermediate" as const,
    estimatedMinutes: 20,
    provenance: { sourceKind: "openalex" as const, sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z" },
  }));
  return [...make("direct", 20), ...make("adjacent", 12), ...make("distant", 8)];
}

describe("explainable exploration selection", () => {
  it("filters candidates that are irrelevant, untrusted, inaccessible, or lack required bridges", () => {
    const invalid: ExplorationCandidate[] = [
      { ...candidates()[0], id: "irrelevant", relevance: 0.1 },
      { ...candidates()[0], id: "untrusted", trust: 0.1 },
      { ...candidates()[0], id: "blocked", accessible: false },
      { ...candidates()[20], id: "adjacent-no-bridge", bridge: undefined, bridgeEvidence: undefined },
      { ...candidates()[32], id: "distant-no-value", taskValue: undefined },
    ];
    expect(filterEligibleCandidates([...candidates(), ...invalid]).map((item) => item.id)).not.toEqual(
      expect.arrayContaining(invalid.map((item) => item.id)),
    );
  });

  it("rejects a text-only bridge without concept or citation evidence", () => {
    const textOnly = { ...candidates()[20], id: "text-only", bridge: "plausible sounding bridge", bridgeEvidence: undefined };
    expect(filterEligibleCandidates([textOnly])).toEqual([]);
  });

  it.each([
    ["low", { direct: 16, adjacent: 4, distant: 0 }],
    ["medium", { direct: 12, adjacent: 6, distant: 2 }],
    ["high", { direct: 8, adjacent: 7, distant: 5 }],
  ] as const)("enforces the %s 20-item quota", (level, expected) => {
    const selected = selectExplorationCandidates(candidates(), { surpriseLevel: level, limit: 20, lambda: 0.72 });
    expect(Object.fromEntries(["direct", "adjacent", "distant"].map((band) => [
      band, selected.filter((item) => item.band === band).length,
    ]))).toEqual(expected);
  });

  it("uses selected-only greedy MMR and is invariant to candidate traversal order", () => {
    const input = candidates();
    const forward = selectExplorationCandidates(input, { surpriseLevel: "medium", limit: 20, lambda: 0.55 });
    const reversed = selectExplorationCandidates([...input].reverse(), { surpriseLevel: "medium", limit: 20, lambda: 0.55 });
    expect(forward.map((item) => item.id)).toEqual(reversed.map((item) => item.id));
    expect(new Set(forward.slice(0, 8).flatMap((item) => item.conceptIds)).size).toBeGreaterThan(2);
  });

  it("renders four readable reasons for every selected item", () => {
    const explanation = explainCandidate(candidates()[32]);
    expect(explanation).toEqual(expect.objectContaining({
      relationship: expect.any(String), bridge: expect.any(String), difficulty: expect.any(String), newValue: expect.any(String),
    }));
    expect(Object.values(explanation).every((value) => value.trim().length > 8)).toBe(true);
  });
});
