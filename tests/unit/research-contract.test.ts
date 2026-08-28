import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createResearchSessionSchema,
  graphUpdateSchema,
  nodeActionSchema,
} from "@/lib/research/schemas";
import { explainPrivateWorkspaceError, explainResearchFailure } from "@/lib/research/failures";
import { ResearchError } from "@/lib/research/types";

describe("research workspace contracts", () => {
  it("keeps the runtime ResearchSession model in the Prisma schema", () => {
    const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/model ResearchSession\s*\{/);
    expect(schema).toContain("searchesJson");
  });

  it("loads session explore deep links from the persisted owner-scoped route", () => {
    const page = readFileSync(path.join(process.cwd(), "app/research/[sessionId]/explore/[interactionId]/page.tsx"), "utf8");
    expect(page).toContain("/api/research/sessions/${encodeURIComponent(sessionId)}/searches/${encodeURIComponent(interactionId)}");
    expect(page).not.toContain("/api/search?interactionId=");
  });

  it("does not let temporary database cleanup turn a completed P03 experiment into a failure", () => {
    const experiment = readFileSync(path.join(process.cwd(), "scripts/experiment-personal-graph.ts"), "utf8");
    expect(experiment).not.toContain("fs.rmSync(databaseDirectory");
    expect(experiment).toContain("await cleanupExperimentDirectory(databaseDirectory)");
  });

  it("does not accept an owner identity from request bodies", () => {
    expect(createResearchSessionSchema.safeParse({ researchQuestion: "Graph RAG", ownerId: "attacker" }).success).toBe(false);
    expect(createResearchSessionSchema.safeParse({ researchQuestion: "Graph RAG", userId: "attacker" }).success).toBe(false);
  });

  it("validates editable graph state and node actions", () => {
    expect(graphUpdateSchema.safeParse({ expectedVersion: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] }).success).toBe(true);
    expect(nodeActionSchema.safeParse({ action: "search", nodeId: "topic", topic: "RAG" }).success).toBe(true);
    expect(nodeActionSchema.safeParse({ action: "search", nodeId: "topic", topic: "RAG", taskType: "project", level: "graduate", sliderValue: 72 }).success).toBe(true);
    expect(nodeActionSchema.safeParse({ action: "search", nodeId: "topic", topic: "RAG", sliderValue: 101 }).success).toBe(false);
    expect(nodeActionSchema.safeParse({ action: "library", nodeId: "topic", topic: "" }).success).toBe(false);
  });

  it("provides understandable expired, empty, source failure and corrupt recovery messages", () => {
    expect(explainResearchFailure("EXPIRED_INTERACTION")).toContain("已过期");
    expect(explainResearchFailure("NO_RESOURCES")).toContain("没有找到资源");
    expect(explainResearchFailure("SOURCE_FAILURE")).toContain("来源暂时不可用");
    expect(explainResearchFailure("CORRUPT_RECOVERY")).toContain("安全恢复");
  });

  it("does not disguise identity or source outages as a missing workspace", () => {
    expect(explainPrivateWorkspaceError(new ResearchError("NOT_FOUND", "missing"))).toContain("找不到");
    expect(explainPrivateWorkspaceError(new ResearchError("PRINCIPAL_UNAVAILABLE", "identity down"))).toContain("身份服务暂时不可用");
    expect(explainPrivateWorkspaceError(new ResearchError("SOURCE_FAILURE", "database down"))).toContain("服务暂时不可用");
    expect(explainPrivateWorkspaceError(new Error("unexpected"))).toContain("意外错误");
  });
});
