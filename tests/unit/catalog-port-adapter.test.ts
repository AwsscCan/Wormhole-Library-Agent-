import { afterEach, describe, expect, it } from "vitest";
import {
  bindSourceTransparentCatalogAdapter,
  createSourceTransparentCatalogAdapter,
  toSourceTransparentResource,
} from "@/lib/federation/catalogPortAdapter";
import { clearPackage02SourceCatalogPortForTests, queryTopicLibrary } from "@/lib/research/catalogPort";
import type { EvidenceItem } from "@/lib/federation/types";

const FIXED_NOW = 1_750_000_000_000;
const NOW = () => FIXED_NOW;

function okTransport(body: unknown): () => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

const DOI = "10.5555/3295222.3295349";

afterEach(() => clearPackage02SourceCatalogPortForTests());

describe("toSourceTransparentResource", () => {
  it("projects a multi-source evidence item with additional provenance", () => {
    const item: EvidenceItem = {
      id: `doi:${DOI}`,
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      year: 2017,
      excerpt: "The transformer architecture.",
      sources: [
        { kind: "openalex", label: "OpenAlex", sourceId: "W2741809807", retrievedAt: FIXED_NOW },
        { kind: "openlibrary", label: "Open Library", sourceId: "OL45804W", retrievedAt: FIXED_NOW },
      ],
      retrievedAt: FIXED_NOW,
      doi: DOI,
    };
    const resource = toSourceTransparentResource(item);
    expect(resource.provenance.sourceKind).toBe("openalex");
    expect(resource.additionalProvenance?.map((item) => item.sourceKind)).toEqual(["openlibrary"]);
  });
});

describe("createSourceTransparentCatalogAdapter", () => {
  it("maps source outcomes into a live topic result", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: okTransport({ results: [{ id: "https://openalex.org/W1", display_name: "Attention Is All You Need", publication_year: 2017, authorships: [] }] }), now: NOW },
        openLibrary: { transport: okTransport({ docs: [] }), now: NOW },
        seedSearch: async () => [],
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "attention", limit: 12 });
    expect(result.sourceStatus).toBe("live");
    expect(result.degraded).toBe(false);
    expect(result.sources?.some((source) => source.status === "success")).toBe(true);
  });

  it("exposes the bound port through queryTopicLibrary", async () => {
    bindSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: okTransport({ results: [{ id: "https://openalex.org/W1", display_name: "Attention Is All You Need", publication_year: 2017, authorships: [] }] }), now: NOW },
        openLibrary: { transport: okTransport({ docs: [] }), now: NOW },
        seedSearch: async () => [],
        now: NOW,
      },
    });
    const result = await queryTopicLibrary({ query: "attention", limit: 12 });
    expect(result.sourceStatus).toBe("live");
    expect(result.resources).toHaveLength(1);
  });
});
