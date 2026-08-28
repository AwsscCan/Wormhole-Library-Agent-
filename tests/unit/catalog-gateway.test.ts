import { describe, expect, it } from "vitest";
import { searchCatalogGateway } from "@/lib/catalog/gateway";

const NOW = () => 1_750_000_000_000;

describe("catalog gateway", () => {
  it("keeps external source links and exposes failed sources instead of relabelling seed data", async () => {
    const result = await searchCatalogGateway({ query: "retrieval augmented generation", limit: 4 }, {
      now: NOW,
      openAlex: { transport: async () => { throw new Error("upstream unavailable"); }, now: NOW },
      openLibrary: {
        transport: async () => new Response(JSON.stringify({
          docs: [{ key: "/works/OL123W", title: "Practical RAG", author_name: ["Ada"], first_publish_year: 2024 }],
        }), { status: 200 }),
        now: NOW,
      },
      seedSearch: async () => [{
        id: "seed:rag", type: "paper", title: "Seed RAG", authors: ["Seed"], language: "en",
        why: "offline fallback", availability: "online", difficulty: "undergrad", concepts: [], qualityScore: 0.5,
      }],
    });

    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "openalex", status: "failed" }),
      expect.objectContaining({ kind: "openlibrary", status: "success" }),
      expect.objectContaining({ kind: "seed", status: "success" }),
    ]));
    expect(result.records.find((record) => record.sourceLabel === "Open Library")).toMatchObject({
      sourceUrl: "https://openlibrary.org/works/OL123W",
    });
    expect(result.records.find((record) => record.sourceLabel === "本地种子")?.sourceUrl).toBeUndefined();
  });
});
