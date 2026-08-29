import { describe, expect, it } from "vitest";
import { openLibrarySubjectId, projectOpenLibrarySearchSubject, projectOpenLibrarySubject } from "@/lib/catalog/openLibrarySubjects";

describe("Open Library subject constellation", () => {
  it("normalizes a visible category into an Open Library subject id", () => {
    expect(openLibrarySubjectId("Artificial Intelligence")).toBe("artificial_intelligence");
  });

  it("projects works and frequent child subjects", () => {
    const result = projectOpenLibrarySubject("computer_science", {
      name: "Computer science",
      work_count: 200,
      works: [
        { key: "/works/OL1W", title: "AI Systems", authors: [{ name: "Ada" }], subject: ["Artificial intelligence", "Algorithms"] },
        { key: "/works/OL2W", title: "Modern AI", authors: [{ name: "Lin" }], subject: ["Artificial intelligence"] },
      ],
    });
    expect(result.works).toHaveLength(2);
    expect(result.branches[0]).toMatchObject({ id: "artificial_intelligence", count: 2 });
  });

  it("uses search results when a subject endpoint has no works", () => {
    const result = projectOpenLibrarySearchSubject("science", {
      numFound: 12,
      docs: [{ key: "/works/OL9W", title: "A Science Book", author_name: ["Mira"], subject: ["Physics"] }],
    });
    expect(result.workCount).toBe(12);
    expect(result.works[0]?.title).toBe("A Science Book");
  });
});
