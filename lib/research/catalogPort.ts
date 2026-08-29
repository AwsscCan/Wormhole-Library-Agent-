import type { TopicLibraryResult } from "./types";

export interface SourceTransparentCatalogPort {
  searchTopic(input: { query: string; limit?: number; ownerId?: string }): Promise<TopicLibraryResult>;
}

const ports = globalThis as unknown as { __package02SourceCatalogPort?: SourceTransparentCatalogPort };

/** Package 02 binds its provenance-aware public port during integration. */
export function bindPackage02SourceCatalogPort(port: SourceTransparentCatalogPort) {
  ports.__package02SourceCatalogPort = port;
}

export async function queryTopicLibrary(input: { query: string; limit?: number; ownerId?: string }): Promise<TopicLibraryResult> {
  const port = ports.__package02SourceCatalogPort;
  if (!port) return {
    resources: [], sourceStatus: "unavailable", degraded: true,
    message: "Source-transparent catalog port is not integrated",
  };
  return port.searchTopic(input);
}

export function clearPackage02SourceCatalogPortForTests() { delete ports.__package02SourceCatalogPort; }
