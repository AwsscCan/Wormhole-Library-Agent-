import { describe, expect, it } from "vitest";
import {
  createResearchSessionSchema,
  graphUpdateSchema,
  nodeActionSchema,
} from "@/lib/research/schemas";
import { explainResearchFailure } from "@/lib/research/failures";

describe("research workspace contracts", () => {
  it("does not accept an owner identity from request bodies", () => {
    expect(createResearchSessionSchema.safeParse({ researchQuestion: "Graph RAG", ownerId: "attacker" }).success).toBe(false);
    expect(createResearchSessionSchema.safeParse({ researchQuestion: "Graph RAG", userId: "attacker" }).success).toBe(false);
  });

  it("validates editable graph state and node actions", () => {
    expect(graphUpdateSchema.safeParse({ expectedVersion: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] }).success).toBe(true);
    expect(nodeActionSchema.safeParse({ action: "search", nodeId: "topic", topic: "RAG" }).success).toBe(true);
    expect(nodeActionSchema.safeParse({ action: "library", nodeId: "topic", topic: "" }).success).toBe(false);
  });

  it("provides understandable expired, empty, source failure and corrupt recovery messages", () => {
    expect(explainResearchFailure("EXPIRED_INTERACTION")).toContain("已过期");
    expect(explainResearchFailure("NO_RESOURCES")).toContain("没有找到资源");
    expect(explainResearchFailure("SOURCE_FAILURE")).toContain("来源暂时不可用");
    expect(explainResearchFailure("CORRUPT_RECOVERY")).toContain("安全恢复");
  });
});
