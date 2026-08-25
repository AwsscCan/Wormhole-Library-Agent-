import { describe, expect, it } from "vitest";
import { buildEvidenceBacklinks, sessionResourceHref, validateEvidenceGraph } from "@/lib/workbench/links";

describe("workbench navigation and evidence traceability", () => {
  it("keeps the research session id on catalog and continued-search jumps", () => {
    expect(sessionResourceHref("session / 1", "resource/2")).toBe("/research/session%20%2F%201/map?sessionId=session%20%2F%201&resourceId=resource%2F2");
  });

  it("supports claim evidence roles and draft-to-resource/note backlinks", () => {
    const graph = {
      claims: [{ id: "claim-1", text: "Retrieval quality affects answer quality" }],
      evidence: [{ id: "ev-1", resourceId: "paper-1", noteId: "note-1", label: "Evaluation result" }],
      links: [{ id: "link-1", claimId: "claim-1", evidenceId: "ev-1", role: "supports" as const }],
      draftParagraphs: [{ id: "draft-1", text: "Evaluation paragraph", sourceRefs: [{ resourceId: "paper-1", noteId: "note-1" }] }],
    };
    expect(validateEvidenceGraph(graph)).toEqual([]);
    expect(buildEvidenceBacklinks(graph).get("draft-1")).toEqual([
      { resourceId: "paper-1", noteId: "note-1" },
    ]);
  });

  it("rejects dangling evidence links instead of presenting guesses as facts", () => {
    const errors = validateEvidenceGraph({
      claims: [], evidence: [], links: [{ id: "bad", claimId: "missing", evidenceId: "also-missing", role: "to_verify" }], draftParagraphs: [],
    });
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("missing claim"), expect.stringContaining("missing evidence")]));
  });
});
