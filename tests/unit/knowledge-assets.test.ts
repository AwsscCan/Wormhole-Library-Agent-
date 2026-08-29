import { describe, expect, it } from "vitest";
import { KnowledgeAssetError, retentionExpiry, validateKnowledgeAsset } from "@/lib/knowledge/assets";

describe("knowledge asset rules", () => {
  it("defaults temporary assets to exactly 30 days while library assets do not expire", () => {
    const now = new Date("2026-08-29T00:00:00.000Z");
    expect(retentionExpiry("temporary", now)?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(retentionExpiry("library", now)).toBeNull();
  });
  it("allows bounded research files and rejects executable or oversized uploads", () => {
    expect(() => validateKnowledgeAsset("reading.bib", 42)).not.toThrow();
    expect(() => validateKnowledgeAsset("payload.exe", 42)).toThrow(KnowledgeAssetError);
    expect(() => validateKnowledgeAsset("large.pdf", 26 * 1024 * 1024)).toThrow(KnowledgeAssetError);
  });
});
