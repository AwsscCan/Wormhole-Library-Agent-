import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAppComposition } from "@/lib/composition";
import { clearCurrentPrincipalPortForTests, requireCurrentPrincipal } from "@/lib/research/principal";
import { clearPackage02SourceCatalogPortForTests, queryTopicLibrary } from "@/lib/research/catalogPort";
import { readMemorySummary, clearWorkbenchPortsForTests } from "@/lib/workbench/ports";
import {
  clearMemoryReadPortForTests,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  resetSemanticEmbedderForTests,
} from "@/lib/research/memory";

let originalOpenLibraryDisabled: string | undefined;

beforeEach(() => {
  originalOpenLibraryDisabled = process.env.OPENLIBRARY_DISABLED;
  process.env.OPENLIBRARY_DISABLED = "1";
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
});

afterEach(() => {
  clearCurrentPrincipalPortForTests();
  clearPackage02SourceCatalogPortForTests();
  clearWorkbenchPortsForTests();
  clearMemoryReadPortForTests();
  if (originalOpenLibraryDisabled === undefined) delete process.env.OPENLIBRARY_DISABLED;
  else process.env.OPENLIBRARY_DISABLED = originalOpenLibraryDisabled;
});

describe("application composition", () => {
  it("binds P01 principal, P02 catalog, and P04 memory for P05 consumers", async () => {
    await ensureAppComposition();

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
  });
});
