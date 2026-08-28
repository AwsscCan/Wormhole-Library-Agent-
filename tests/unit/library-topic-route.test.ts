import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/library/topic/route";
import { bindPackage02SourceCatalogPort, clearPackage02SourceCatalogPortForTests } from "@/lib/research/catalogPort";

afterEach(() => clearPackage02SourceCatalogPortForTests());

describe("/api/library/topic", () => {
  it("returns the bound topic library response", async () => {
    bindPackage02SourceCatalogPort({
      searchTopic: async ({ query, limit }) => ({
        resources: [],
        sourceStatus: "unavailable",
        degraded: true,
        message: `stub:${query}:${limit ?? "none"}`,
      }),
    });
    const response = await GET(new Request("http://local/api/library/topic?query=RAG&limit=7"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sourceStatus: "unavailable",
      message: "stub:RAG:7",
    });
  });
});
