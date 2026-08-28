import { afterEach, describe, expect, it } from "vitest";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { generateEvidenceDraft } from "@/lib/writing/draftService";
import { clearWritingPortsForTest, installWritingPorts } from "@/lib/writing/ports";

const guest = (id: string): CurrentPrincipal => ({ id, mode: "guest" });
const guestOwner = (id: string) => `guest:${id}`;

describe("generateEvidenceDraft", () => {
  afterEach(() => clearWritingPortsForTest());

  it("requires at least three evidence selections", async () => {
    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: [] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("evidence") });
  });

  it("blocks factual prose for an unverified autonomous selection", async () => {
    installWritingPorts({
      session: async () => ({ id: "s1", ownerId: guestOwner("a"), researchQuestion: "question", evidenceIds: ["candidate-unverified", "e1", "e2", "e3"] }),
      evidence: async ({ evidenceId }) => ({
        id: evidenceId,
        title: `Title ${evidenceId}`,
        excerpt: `Finding for ${evidenceId}.`,
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-24T00:00:00.000Z" },
        verificationStatus: evidenceId === "candidate-unverified" ? "needs_review" : "verified",
        userConfirmedAt: evidenceId === "candidate-unverified" ? undefined : "2026-08-24T00:00:00.000Z",
      }),
      discover: async () => [],
    });

    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: ["candidate-unverified", "e1", "e2"] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

  });

  it("does not use evidence outside the caller-owned session", async () => {
    installWritingPorts({
      session: async () => ({ id: "s1", ownerId: guestOwner("a"), researchQuestion: "question", evidenceIds: ["e1", "e2", "e3"] }),
      evidence: async ({ evidenceId }) => ({
        id: evidenceId,
        title: evidenceId,
        excerpt: `Finding for ${evidenceId}.`,
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-24T00:00:00.000Z" },
        verificationStatus: "verified",
        userConfirmedAt: "2026-08-24T00:00:00.000Z",
      }),
      discover: async () => [],
    });
    await expect(generateEvidenceDraft({ principal: guest("a"), sessionId: "s1", focus: "methods", evidenceIds: ["e1", "e2", "outside"] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
