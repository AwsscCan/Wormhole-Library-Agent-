import "server-only";
import type { WritingPorts } from "@/lib/writing/types";

export class WritingPortsUnavailableError extends Error {
  constructor() {
    super("Writing session and catalog dependencies are not configured");
    this.name = "WritingPortsUnavailableError";
  }
}

let installedPorts: WritingPorts | undefined;

/**
 * Installs the accepted package adapters at the server composition root.
 * The registry stores only narrow service references; workflow data remains
 * authoritative in the package databases and is re-checked on every call.
 */
export function installWritingPorts(ports: WritingPorts): void {
  installedPorts = ports;
}

export function requireWritingPorts(): WritingPorts {
  if (!installedPorts) throw new WritingPortsUnavailableError();
  return installedPorts;
}

export function writingPortsAreInstalled(): boolean {
  return installedPorts !== undefined;
}

export function clearWritingPortsForTest(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Writing ports cannot be cleared in production");
  }
  installedPorts = undefined;
}
