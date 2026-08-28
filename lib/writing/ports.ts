import "server-only";
import type { WritingPorts } from "@/lib/writing/types";

export class WritingPortsUnavailableError extends Error {
  constructor() {
    super("Writing session and catalog dependencies are not configured");
    this.name = "WritingPortsUnavailableError";
  }
}

const registry = globalThis as unknown as { __wormholeWritingPorts?: WritingPorts };

/**
 * Installs the accepted package adapters at the server composition root.
 * The registry stores only narrow service references; workflow data remains
 * authoritative in the package databases and is re-checked on every call.
 */
export function installWritingPorts(ports: WritingPorts): void {
  registry.__wormholeWritingPorts = ports;
}

export function requireWritingPorts(): WritingPorts {
  if (!registry.__wormholeWritingPorts) throw new WritingPortsUnavailableError();
  return registry.__wormholeWritingPorts;
}

export function writingPortsAreInstalled(): boolean {
  return registry.__wormholeWritingPorts !== undefined;
}

export function clearWritingPortsForTest(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Writing ports cannot be cleared in production");
  }
  delete registry.__wormholeWritingPorts;
}
