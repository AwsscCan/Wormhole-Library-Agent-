/**
 * Package 04 P01 授权写入口测试（验收报告 F-005 / E-006）。
 *
 * owner 必须从 P01 server principal 推导，绝不信任调用方传入的身份；
 * 同时 P02 provenance 与 P03 sessionId 作为只读输入被写入事件与片段。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listLearningEvents,
  recordLearningEventForCurrentPrincipal,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  searchPrivateMemory,
} from "@/lib/research/memory";
import { clearCurrentPrincipalPortForTests, installCurrentPrincipalPortForTests } from "@/lib/research/principal";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

afterEach(() => clearCurrentPrincipalPortForTests());

describe("package 04 principal-derived write path", () => {
  it("derives owner from the package-01 principal, never from caller input", async () => {
    installCurrentPrincipalPortForTests({ read: async () => ({ id: "alice", mode: "member" }) });

    const event = await recordLearningEventForCurrentPrincipal(
      new Request("http://local/api/memory", { method: "POST" }),
      {
        sessionId: "s1",
        kind: "note",
        conceptId: "ml",
        text: "machine learning notes",
        provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-28T00:00:00.000Z" },
      },
    );

    expect(event.ownerId).toBe("member:alice");
    expect(event.provenance?.sourceKind).toBe("openalex");

    const stored = listLearningEvents({ ownerId: "member:alice" });
    expect(stored).toHaveLength(1);
    expect(stored[0].ownerId).toBe("member:alice");
    // 只读 provenance 随事件 + 片段保留
    expect(stored[0].provenance?.sourceLabel).toBe("OpenAlex");
    const hits = searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 });
    expect(hits[0].provenance?.sourceKind).toBe("openalex");
  });

  it("refuses when no principal port is installed", async () => {
    await expect(
      recordLearningEventForCurrentPrincipal(new Request("http://local/api/memory"), { kind: "note", text: "x" }),
    ).rejects.toMatchObject({ code: "PRINCIPAL_UNAVAILABLE" });
  });
});
