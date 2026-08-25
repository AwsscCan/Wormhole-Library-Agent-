import { listInferredPreferences } from "./inference";
import { searchPrivateMemory } from "./indexStore";
import type { MemoryReadPort, MemorySnippet } from "./types";

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

/** Default port backed by the private index + inference engine. */
export const defaultMemoryReadPort: MemoryReadPort = {
  async search(input) {
    return searchPrivateMemory(input) as MemorySnippet[];
  },
  async listInferredPreferences(input) {
    return listInferredPreferences(input.ownerId);
  },
};
