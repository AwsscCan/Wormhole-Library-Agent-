import { describe, expect, it } from "vitest";
import { federateSearch } from "@/lib/federation/federation";
import type { ResourceCard } from "@/lib/types";

const FIXED_NOW = 1_750_000_000_000;
const NOW = () => FIXED_NOW;

function okTransport(body: unknown): () => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

function failTransport(): () => Promise<Response> {
  return async () => { throw new TypeError("fetch failed"); };
}

const DOI = "10.5555/3295222.3295349";

function openAlexBody(): unknown {
  return {
    results: [{
      id: "https://openalex.org/W2741809807",
      doi: `https://doi.org/${DOI}`,
      display_name: "Attention Is All You Need",
      publication_year: 2017,
      authorships: [{ author: { display_name: "Ashish Vaswani" } }],
    }],
  };
}

function openLibraryBody(): unknown {
  return {
    docs: [{
      key: "/works/OL45804W",
      title: "Attention Is All You Need",
      author_name: ["Ashish Vaswani"],
      first_publish_year: 2017,
      doi: [DOI],
    }],
  };
}

function seedCards(): ResourceCard[] {
  return [{
    id: "seed:attention-101",
    type: "paper",
    title: "注意力机制入门",
    authors: ["某人"],
    language: "zh",
    why: "seed",
    location: "本地",
    availability: "online",
    difficulty: "undergrad",
    concepts: [],
    qualityScore: 0.5,
  }];
}

const SEED = async () => seedCards();

describe("federateSearch", () => {
  it("merges the same DOI across OpenAlex and Open Library", async () => {
    const result = await federateSearch({ topic: "attention" }, {
      openAlex: { transport: okTransport(openAlexBody()), now: NOW },
      openLibrary: { transport: okTransport(openLibraryBody()), now: NOW },
      seedSearch: SEED,
      now: NOW,
    });
    expect(result.failures).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    const merged = result.items.find((item) => item.sources.length > 1);
    expect(merged?.id).toBe(`doi:${DOI}`);
    expect(merged?.sources.map((s) => s.kind).sort()).toEqual(["openalex", "openlibrary"]);
  });

  it("keeps seed results when the remote sources fail", async () => {
    const result = await federateSearch({ topic: "attention" }, {
      openAlex: { transport: okTransport(openAlexBody()), now: NOW },
      openLibrary: { transport: failTransport(), now: NOW },
      seedSearch: SEED,
      now: NOW,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.source).toBe("openlibrary");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
  });

  it("marks all empty/failed sources as degraded", async () => {
    const result = await federateSearch({ topic: "nothing" }, {
      openAlex: { transport: failTransport(), now: NOW },
      openLibrary: { transport: failTransport(), now: NOW },
      seedSearch: async () => [],
      now: NOW,
    });
    expect(result.items).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    expect(result.degraded).toBe(true);
  });
});
