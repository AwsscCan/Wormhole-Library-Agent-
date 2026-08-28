import { listInferredPreferences } from "./inference";
import { searchPrivateMemory } from "./indexStore";
import type { MemoryReadPort, WorkbenchInferredPreference, WorkbenchMemorySnippet } from "./types";

/**
 * MemoryReadPort binding, mirroring the package-01 principal port pattern.
 *
 * Package 05 consumes `getMemoryReadPort()`; when package 04 has not been
 * integrated, the port is null and package 05 must degrade explicitly to
 * history-free recommendation.
 */

const store = globalThis as unknown as { __package04MemoryReadPort?: MemoryReadPort };

export function bindMemoryReadPort(port: MemoryReadPort): void {
  store.__package04MemoryReadPort = port;
}

export function getMemoryReadPort(): MemoryReadPort | null {
  return store.__package04MemoryReadPort ?? null;
}

export function installMemoryReadPortForTests(port: MemoryReadPort): void {
  if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
    throw new Error("Test memory port injection is disabled outside tests");
  }
  bindMemoryReadPort(port);
}

export function clearMemoryReadPortForTests(): void {
  delete store.__package04MemoryReadPort;
}

/** P04 概念偏好 → P05 key/value 偏好 DTO。 */
function toWorkbenchPreference(p: { id: string; conceptId: string; confidence: number; evidenceCount: number; expiresAt: string }): WorkbenchInferredPreference {
  return {
    id: p.id,
    key: "conceptId",
    value: p.conceptId,
    confidence: p.confidence,
    evidenceCount: p.evidenceCount,
    expiresAt: p.expiresAt,
  };
}

/** 私有索引命中 → P05 snippet DTO（带 score）。 */
function toWorkbenchSnippet(h: { id: string; sourceId: string; sessionId: string; createdAt: string; text: string; score: number }): WorkbenchMemorySnippet {
  return {
    id: h.id,
    sourceId: h.sourceId,
    sessionId: h.sessionId,
    createdAt: h.createdAt,
    text: h.text,
    score: h.score,
  };
}

/** Default port backed by the private index + inference engine (P05 DTO 形状)。 */
export const defaultMemoryReadPort: MemoryReadPort = {
  async search(input) {
    const hits = await searchPrivateMemory({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      query: input.query,
      limit: input.limit,
    });
    return hits.map(toWorkbenchSnippet);
  },
  async listInferredPreferences(input) {
    return listInferredPreferences(input.ownerId).map(toWorkbenchPreference);
  },
};
