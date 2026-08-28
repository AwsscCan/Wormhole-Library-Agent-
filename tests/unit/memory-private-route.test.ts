import { beforeEach, describe, expect, it } from "vitest";
import { GET, DELETE } from "@/app/api/v3/memory/route";
import { encodeGuestForTest } from "@/lib/auth/principal";
import {
  countMemorySnippets,
  InMemoryMemoryPersistenceStore,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  setMemoryPersistenceStoreForTests,
} from "@/lib/research/memory";

const guestId = "g".repeat(43);
function guestRequest(path: string, method = "GET") {
  return new Request(`http://local${path}`, {
    method,
    headers: { cookie: `wl_guest=${encodeGuestForTest(guestId)}` },
  });
}

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  setMemoryPersistenceStoreForTests(new InMemoryMemoryPersistenceStore());
});

describe("private memory route", () => {
  it("derives the memory owner from the server principal and rejects userId", async () => {
    const response = await GET(guestRequest("/api/v3/memory"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ userId: `guest:${guestId}` });

    const forged = await GET(guestRequest("/api/v3/memory?userId=bob"));
    expect(forged.status).toBe(400);
  });

  it("resets legacy preferences and only the current principal private RAG memory", async () => {
    await recordLearningEvent({ ownerId: `guest:${guestId}`, sessionId: "session-a", kind: "note", text: "private note" });
    await recordLearningEvent({ ownerId: "member:other", sessionId: "session-b", kind: "note", text: "other note" });
    expect(countMemorySnippets(`guest:${guestId}`)).toBe(1);
    expect(countMemorySnippets("member:other")).toBe(1);

    const response = await DELETE(guestRequest("/api/v3/memory", "DELETE"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ userId: `guest:${guestId}`, recentUpdates: [] });
    expect(countMemorySnippets(`guest:${guestId}`)).toBe(0);
    expect(countMemorySnippets("member:other")).toBe(1);
  });
});
