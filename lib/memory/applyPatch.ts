/**
 * Apply Patch Module
 *
 * Implements the MemoryCompiler.apply() interface.
 * Applies structured MemoryPatches to a MemorySnapshot, returning the
 * updated snapshot and a history entry.
 *
 * Design doc 11.3: patches are applied to memory categories:
 *   reading.* / difficulty.* / citation.* / serendipity.*
 *
 * Operations:
 *   set              → replace value
 *   add_or_increment → append to list or increment number
 *   decrement        → subtract from number
 *   remove           → remove from list
 */

import type {
  MemorySnapshot,
  MemoryPatch,
  MemoryHistoryEntry,
} from "../types";

/**
 * Deep clone a memory snapshot (to avoid mutation).
 */
function cloneSnapshot(snap: MemorySnapshot): MemorySnapshot {
  return {
    reading: { ...snap.reading },
    difficulty: { ...snap.difficulty },
    citation: { ...snap.citation },
    serendipity: {
      ...snap.serendipity,
      likedDomains: [...snap.serendipity.likedDomains],
      dislikedDomains: [...snap.serendipity.dislikedDomains],
    },
  };
}

/**
 * Navigate to the parent object of a key.
 * e.g., "reading.prefEmpirical" → returns the reading object + "prefEmpirical"
 */
function resolveKey(
  snapshot: MemorySnapshot,
  key: string
): { parent: Record<string, unknown>; field: string } | null {
  const parts = key.split(".");
  if (parts.length !== 2) return null;

  const [category, field] = parts;
  const parent = (snapshot as unknown as Record<string, Record<string, unknown>>)[category];
  if (!parent || typeof parent !== "object") return null;

  return { parent: parent, field };
}

/**
 * Apply a single patch to a memory snapshot (mutates in place).
 */
function applySinglePatch(snapshot: MemorySnapshot, patch: MemoryPatch): void {
  const resolved = resolveKey(snapshot, patch.key);
  if (!resolved) return;

  const { parent, field } = resolved;
  const currentValue = parent[field];

  switch (patch.operation) {
    case "set":
      parent[field] = patch.value;
      break;

    case "add_or_increment":
      if (Array.isArray(currentValue)) {
        if (!currentValue.includes(patch.value)) {
          currentValue.push(patch.value);
        }
      } else if (typeof currentValue === "number") {
        parent[field] = currentValue + (patch.value as number);
      } else {
        // If field doesn't exist, create as array
        if (currentValue === undefined) {
          parent[field] = [patch.value];
        }
      }
      break;

    case "decrement":
      if (typeof currentValue === "number") {
        parent[field] = Math.max(0, currentValue - (patch.value as number));
      } else if (currentValue === undefined && field === "mathTolerance") {
        // Initialize then decrement
        parent[field] = Math.max(0, 0.5 - (patch.value as number));
      } else if (currentValue === undefined && field === "theoryTolerance") {
        parent[field] = Math.max(0, 0.5 - (patch.value as number));
      }
      break;

    case "increment":
      // 03-02 补交：与概念级 patch 语义对齐（如 too_close 抬升滑杆）
      if (typeof currentValue === "number") {
        parent[field] = currentValue + (patch.value as number);
      } else if (Array.isArray(currentValue)) {
        if (!currentValue.includes(patch.value)) {
          currentValue.push(patch.value);
        }
      } else if (currentValue === undefined) {
        parent[field] = patch.value;
      }
      break;

    case "remove":
      if (Array.isArray(currentValue)) {
        parent[field] = currentValue.filter((v) => v !== patch.value);
      }
      break;
  }
}

/**
 * Apply multiple patches to a memory snapshot.
 * Returns the updated snapshot and a history entry.
 *
 * Design doc 11.3: patches are applied atomically.
 */
export function applyPatch(
  memory: MemorySnapshot,
  patches: MemoryPatch[]
): { memory: MemorySnapshot; history: MemoryHistoryEntry } {
  const updated = cloneSnapshot(memory);

  for (const patch of patches) {
    applySinglePatch(updated, patch);
  }

  // Ensure mathTolerance and theoryTolerance stay in [0, 1]
  if (updated.difficulty.mathTolerance !== undefined) {
    updated.difficulty.mathTolerance = Math.max(
      0,
      Math.min(1, updated.difficulty.mathTolerance)
    );
  }
  if (updated.difficulty.theoryTolerance !== undefined) {
    updated.difficulty.theoryTolerance = Math.max(
      0,
      Math.min(1, updated.difficulty.theoryTolerance)
    );
  }

  // 03-02 补交：确保 defaultSlider 保持在 [0, 100]
  if (typeof updated.serendipity.defaultSlider === "number") {
    updated.serendipity.defaultSlider = Math.max(
      0,
      Math.min(100, updated.serendipity.defaultSlider)
    );
  }

  // Build history entry
  const historyEntry: MemoryHistoryEntry = {
    timestamp: new Date().toISOString(),
    action: "feedback",
    detail: describePatches(patches),
    patches,
  };

  return { memory: updated, history: historyEntry };
}

/**
 * Generate a human-readable description of patches.
 */
function describePatches(patches: MemoryPatch[]): string {
  const descriptions: string[] = [];
  for (const p of patches) {
    const [category, field] = p.key.split(".");
    switch (p.operation) {
      case "set":
        descriptions.push(`${category}.${field} = ${p.value}`);
        break;
      case "add_or_increment":
        descriptions.push(`${category}.${field} += ${p.value}`);
        break;
      case "decrement":
        descriptions.push(`${category}.${field} -= ${p.value}`);
        break;
      case "remove":
        descriptions.push(`${category}.${field} -= ${p.value}`);
        break;
    }
  }
  return descriptions.join("; ");
}
