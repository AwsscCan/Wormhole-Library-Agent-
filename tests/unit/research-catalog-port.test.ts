import { afterEach, describe, expect, it } from "vitest";
import { bindPackage02SourceCatalogPort, clearPackage02SourceCatalogPortForTests, queryTopicLibrary } from "@/lib/research/catalogPort";

afterEach(() => clearPackage02SourceCatalogPortForTests());

describe("package 02 source-transparent catalog port", () => {
  it("degrades explicitly when package 02 is not integrated", async () => {
    await expect(queryTopicLibrary({ query: "RAG", limit: 12 })).resolves.toEqual({
      resources: [], sourceStatus: "unavailable", degraded: true,
      message: "Source-transparent catalog port is not integrated",
    });
  });

  it("preserves provenance supplied by package 02", async () => {
    bindPackage02SourceCatalogPort({ searchTopic: async () => ({
      resources: [{
        id: "paper-1", type: "paper", title: "RAG", authors: [], language: "en",
        why: "relevant", availability: "online", difficulty: "research", concepts: [], qualityScore: 0.9,
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z" },
      }], sourceStatus: "live", degraded: false,
    }) });
    const result = await queryTopicLibrary({ query: "RAG" });
    expect(result.resources[0].provenance.sourceLabel).toBe("OpenAlex");
    expect(result.sourceStatus).toBe("live");
  });
});
