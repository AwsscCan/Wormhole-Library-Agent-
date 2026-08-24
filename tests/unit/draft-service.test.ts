import { describe, expect, it } from "vitest";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import {
  configureWritingPortsForTest,
  generateEvidenceDraft,
  resetWritingPortsForTest,
} from "@/lib/writing/draftService";

const guest = (id: string): CurrentPrincipal => ({ id, mode: "guest" });

describe("generateEvidenceDraft", () => {
  it("blocks factual prose for unverified autonomous candidates and labels deterministic fallback", async () => {
    configureWritingPortsForTest({
      session: async () => ({ id: "s1", ownerId: "a", researchQuestion: "question", evidenceIds: ["candidate-unverified", "e1", "e2", "e3"] }),
      evidence: async (id) => ({
        id,
        title: `Title ${id}`,
        excerpt: `Finding for ${id}.`,
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-24T00:00:00.000Z" },
        verificationStatus: id === "candidate-unverified" ? "needs_review" : "verified",
        userConfirmedAt: id === "candidate-unverified" ? undefined : "2026-08-24T00:00:00.000Z",
      }),
    });

    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: [] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("evidence") });
    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: ["candidate-unverified"] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

    const draft = await generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: ["e1", "e2", "e3"] });
    expect(draft.source).toBe("deterministic");
    expect(draft.markdown).toContain("[e1]");
    expect(draft.citations.map((x) => x.evidenceId)).toEqual(["e1", "e2", "e3"]);
    expect(draft.checkpointId).toBeTruthy();
    resetWritingPortsForTest();
  });

  it("does not use evidence outside the caller-owned session", async () => {
    configureWritingPortsForTest({
      session: async () => ({ id: "s1", ownerId: "a", researchQuestion: "question", evidenceIds: ["e1", "e2", "e3"] }),
      evidence: async (id) => ({
        id,
        title: id,
        excerpt: `Finding for ${id}.`,
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-24T00:00:00.000Z" },
        verificationStatus: "verified",
        userConfirmedAt: "2026-08-24T00:00:00.000Z",
      }),
    });
    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: ["e1", "e2", "outside"] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    resetWritingPortsForTest();
  });
});
