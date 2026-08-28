import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAppComposition } from "@/lib/composition";
import { clearCurrentPrincipalPortForTests, requireCurrentPrincipal } from "@/lib/research/principal";
import { clearPackage02SourceCatalogPortForTests, queryTopicLibrary } from "@/lib/research/catalogPort";
import { appendExplorationFeedback, readMemorySummary, clearWorkbenchPortsForTests } from "@/lib/workbench/ports";
import { clearWritingPortsForTest, requireWritingPorts, writingPortsAreInstalled } from "@/lib/writing/ports";
import {
  clearMemoryReadPortForTests,
  InMemoryMemoryPersistenceStore,
  listLearningEvents,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  resetSemanticEmbedderForTests,
  setMemoryPersistenceStoreForTests,
} from "@/lib/research/memory";

let originalOpenLibraryDisabled: string | undefined;

beforeEach(() => {
  originalOpenLibraryDisabled = process.env.OPENLIBRARY_DISABLED;
  process.env.OPENLIBRARY_DISABLED = "1";
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
  setMemoryPersistenceStoreForTests(new InMemoryMemoryPersistenceStore());
});

afterEach(() => {
  clearCurrentPrincipalPortForTests();
  clearPackage02SourceCatalogPortForTests();
  clearWorkbenchPortsForTests();
  clearMemoryReadPortForTests();
  clearWritingPortsForTest();
  if (originalOpenLibraryDisabled === undefined) delete process.env.OPENLIBRARY_DISABLED;
  else process.env.OPENLIBRARY_DISABLED = originalOpenLibraryDisabled;
});

describe("application composition", () => {
  it("binds P01 principal, P02 catalog, and P04 memory for P05 consumers", async () => {
    await ensureAppComposition();
    expect(writingPortsAreInstalled()).toBe(true);
    await expect(requireWritingPorts().discover({
      principal: { id: "alice", mode: "member" },
      sessionId: "session-1",
      researchQuestion: "AI Agent",
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ verificationStatus: "needs_review" }),
    ]));

    await expect(
      requireCurrentPrincipal(new Request("http://library.test/api/research/sessions")),
    ).resolves.toMatchObject({ mode: "guest" });
    await expect(queryTopicLibrary({ query: "AI Agent", limit: 1 })).resolves.toMatchObject({
      sourceStatus: expect.not.stringMatching("unavailable"),
    });

    await recordLearningEvent({
      ownerId: "member:alice",
      sessionId: "session-1",
      kind: "note",
      conceptId: "mechanism-design",
      text: "Mechanism design notes from yesterday's exploration",
    });

    await expect(readMemorySummary("member:alice", "session-1", "mechanism design")).resolves.toMatchObject({
      status: "available",
      snippets: [expect.objectContaining({ sourceId: "le-1" })],
    });

    await expect(appendExplorationFeedback({
      ownerId: "member:alice",
      sessionId: "session-1",
      recommendationId: "recommendation-1",
      feedback: "too_hard",
      occurredAt: "2026-08-29T00:00:00.000Z",
    })).resolves.toEqual({ accepted: true, status: "recorded" });
    expect(listLearningEvents({ ownerId: "member:alice", sessionId: "session-1" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "feedback", rating: "too_hard", resourceId: "recommendation-1" }),
      ]),
    );
  });

  it("rolls back P04 feedback when persistence rejects so a retry cannot duplicate it", async () => {
    await ensureAppComposition();
    setMemoryPersistenceStoreForTests({
      load: async () => null,
      save: async () => { throw new Error("disk unavailable"); },
    });

    await expect(appendExplorationFeedback({
      ownerId: "member:alice",
      sessionId: "session-1",
      recommendationId: "recommendation-failed",
      feedback: "useful",
      occurredAt: "2026-08-29T00:00:00.000Z",
    })).resolves.toEqual({ accepted: false, status: "rejected" });
    expect(listLearningEvents({ ownerId: "member:alice" })).toEqual([]);
  });
});
