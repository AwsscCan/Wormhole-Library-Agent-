/**
 * Source Federation failures 单测（TDD）
 *
 * 不打外网 —— 纯函数行为测试。
 * 覆盖"不撒谎降级"承诺的每一条：
 *  - 永不发明第三种状态
 *  - 永远带上 source（让上层精确告诉用户哪个源）
 *  - 透传不丢语义
 *  - 文本品牌对齐
 */

import { describe, expect, it } from "vitest";
import {
  classifyError,
  classifyHttpFailure,
  combineFailures,
  FederationError,
  getFailureMessage,
} from "@/lib/federation/failures";
import type { FederationFailure } from "@/lib/federation/types";

describe("federation/failures — 不撒谎降级承诺的根", () => {
  describe("classifyError（任意错误 → FederationFailure）", () => {
    it("fetch 的 TypeError → unreachable，附原 message", () => {
      const f = classifyError("openlibrary", new TypeError("fetch failed"));
      expect(f.kind).toBe("unreachable");
      expect(f.source).toBe("openlibrary");
      expect(f).toMatchObject({ kind: "unreachable", message: expect.stringMatching(/fetch/) });
    });

    it("Aborted/Timeout 错误 → unreachable + 超时措辞", () => {
      const f = classifyError("openalex", new Error("The operation was aborted"));
      expect(f.kind).toBe("unreachable");
      expect(f).toMatchObject({ kind: "unreachable", message: expect.stringContaining("超时") });
    });

    it("Network 错误码（ENOTFOUND/ECONNRESET/ETIMEDOUT） → unreachable", () => {
      for (const msg of ["ENOTFOUND openlibrary.org", "read ECONNRESET", "connect ETIMEDOUT"]) {
        const f = classifyError("seed", new Error(msg));
        expect(f.kind).toBe("unreachable");
      }
    });

    it("JSON/Syntax 错误 → parse_error，body 截断 200", () => {
      const longBody = "Unexpected token < in JSON at position 0" + "x".repeat(500);
      const f = classifyError("openalex", new Error(longBody));
      expect(f.kind).toBe("parse_error");
      expect(f).toMatchObject({ kind: "parse_error", body: expect.any(String) });
      if (f.kind === "parse_error") {
        expect(f.body.length).toBeLessThanOrEqual(200);
      }
    });

    it("FederationError 实例 → 透传原 failure，不重新归类", () => {
      const inner: FederationFailure = {
        kind: "rate_limited",
        source: "openalex",
        retryAfterMs: 5000,
      };
      const wrapped = new FederationError(inner);
      const f = classifyError("openalex", wrapped);
      expect(f).toEqual(inner);
    });

    it("非 Error 对象（字符串/对象） → 兜底 unreachable，message 含原值", () => {
      const f1 = classifyError("seed", "weird string");
      expect(f1.kind).toBe("unreachable");
      expect(f1).toMatchObject({ kind: "unreachable", message: expect.stringContaining("weird string") });

      const f2 = classifyError("openlibrary", { code: 42 });
      expect(f2.kind).toBe("unreachable");
    });

    it("context.query 透传到兜底 message 上", () => {
      const f = classifyError(
        "openalex",
        new Error("Random unknown"),
        { query: "transformer" },
      );
      expect(f).toMatchObject({ kind: "unreachable", message: expect.stringContaining("transformer") });
    });
  });

  describe("classifyHttpFailure（HTTP 状态码 → FederationFailure）", () => {
    it("429 + Retry-After: 5 → rate_limited, retryAfterMs = 5000", () => {
      const f = classifyHttpFailure("openlibrary", 429, "rate limited", "5");
      expect(f).toMatchObject({ kind: "rate_limited", retryAfterMs: 5000 });
    });

    it("429 没 Retry-After → rate_limited 无 retryAfterMs", () => {
      const f = classifyHttpFailure("openalex", 429, "boom");
      expect(f.kind).toBe("rate_limited");
      expect(f).toMatchObject({ kind: "rate_limited" });
      expect("retryAfterMs" in f).toBe(false);
    });

    it("500/502/503/504 → unreachable + 服务端错误措辞", () => {
      for (const status of [500, 502, 503, 504]) {
        const f = classifyHttpFailure("openlibrary", status, "internal");
        expect(f.kind).toBe("unreachable");
        expect(f).toMatchObject({ kind: "unreachable", message: expect.stringContaining(String(status)) });
      }
    });

    it("400-499 非 429 → parse_error，带 body 摘要", () => {
      const f = classifyHttpFailure("openlibrary", 404, "not found");
      expect(f).toMatchObject({ kind: "parse_error", body: expect.stringContaining("not found") });
    });

    it("body 截断到 200 字（防爆前端日志）", () => {
      const longBody = "x".repeat(5000);
      const f = classifyHttpFailure("openalex", 422, longBody);
      expect(f.kind).toBe("parse_error");
      if (f.kind === "parse_error") {
        expect(f.body.length).toBeLessThanOrEqual(200);
      }
    });

    it("2xx 错误地进来 → 兜底 parse_error + 指明路径错", () => {
      const f = classifyHttpFailure("openalex", 200, "shouldnt be here");
      expect(f.kind).toBe("parse_error");
      expect(f).toMatchObject({ kind: "parse_error", body: expect.stringContaining("unexpected 2xx") });
    });
  });

  describe("combineFailures（多源失败聚合）", () => {
    it("空数组 → null", () => {
      expect(combineFailures([])).toBeNull();
    });

    it("单元素 → 原样返回（不发明新对象）", () => {
      const f: FederationFailure = { kind: "rate_limited", source: "openalex" };
      expect(combineFailures([f])).toBe(f);
    });

    it("多个同 kind → 取第一个，不假装合并", () => {
      const a: FederationFailure = { kind: "unreachable", source: "openalex", message: "a" };
      const b: FederationFailure = { kind: "unreachable", source: "openlibrary", message: "b" };
      expect(combineFailures([a, b])).toBe(a);
    });

    it("多个异 kind → 包装为 unreachable, message 含全部 kind", () => {
      const a: FederationFailure = { kind: "unreachable", source: "openalex", message: "x" };
      const b: FederationFailure = { kind: "rate_limited", source: "openlibrary" };
      const c = combineFailures([a, b]);
      expect(c?.kind).toBe("unreachable");
      expect(c).toMatchObject({
        kind: "unreachable",
        message: expect.stringMatching(/unreachable/),
      });
      if (c?.kind === "unreachable") {
        expect(c.message).toContain("rate_limited");
      }
    });

    it("三个异 kind（unreachable / rate_limited / parse_error）→ 全部列在 message", () => {
      const failures: FederationFailure[] = [
        { kind: "unreachable", source: "openalex", message: "x" },
        { kind: "rate_limited", source: "openlibrary" },
        { kind: "parse_error", source: "openalex", body: "y" },
      ];
      const c = combineFailures(failures);
      expect(c?.kind).toBe("unreachable");
      if (c?.kind === "unreachable") {
        expect(c.message).toContain("unreachable");
        expect(c.message).toContain("rate_limited");
        expect(c.message).toContain("parse_error");
      }
    });
  });

  describe("getFailureMessage — 品牌话术：含 source 名 + 可操作语", () => {
    it("unreachable：source 名 + 原 message + 安慰语", () => {
      const msg = getFailureMessage({
        kind: "unreachable",
        source: "openlibrary",
        message: "fetch failed",
      });
      expect(msg).toContain("openlibrary");
      expect(msg).toContain("fetch failed");
      expect(msg).toMatch(/可继续|可以稍后/);
    });

    it("rate_limited 带 retryAfterMs → 中文秒数 + '其它来源仍在工作'", () => {
      const msg = getFailureMessage({
        kind: "rate_limited",
        source: "openalex",
        retryAfterMs: 30000,
      });
      expect(msg).toContain("openalex");
      expect(msg).toContain("30");
      expect(msg).toContain("其它来源");
    });

    it("rate_limited 无 retryAfterMs → 不报秒数但仍安慰", () => {
      const msg = getFailureMessage({
        kind: "rate_limited",
        source: "openlibrary",
      });
      expect(msg).toContain("openlibrary");
      expect(msg).not.toMatch(/\d+\s*秒/);
    });

    it("empty → 含 query 文案", () => {
      const msg = getFailureMessage({
        kind: "empty",
        source: "openalex",
        query: "transformer 架构",
      });
      expect(msg).toContain("openalex");
      expect(msg).toContain("transformer 架构");
    });

    it("circuit_open → 含 source + 剩余秒数", () => {
      const now = Date.now();
      const msg = getFailureMessage({
        kind: "circuit_open",
        source: "openlibrary",
        cooldownUntil: now + 15000,
      });
      expect(msg).toContain("openlibrary");
      expect(msg).toMatch(/\d+\s*秒/);
    });

    it("parse_error → 明确说不掩饰，仍可重试", () => {
      const msg = getFailureMessage({
        kind: "parse_error",
        source: "openlibrary",
        body: "garbage",
      });
      expect(msg).toContain("openlibrary");
      expect(msg).toMatch(/伪装|可以稍后/);
    });
  });

  describe("FederationError — throw/catch 链路不丢源信息", () => {
    it("name 是 FederationError", () => {
      const err = new FederationError({
        kind: "unreachable",
        source: "openalex",
        message: "x",
      });
      expect(err.name).toBe("FederationError");
    });

    it("message 来自 getFailureMessage（中文品牌话术）", () => {
      const failure: FederationFailure = {
        kind: "rate_limited",
        source: "openlibrary",
      };
      const err = new FederationError(failure);
      expect(err.message).toContain("openlibrary");
      expect(err.message).toMatch(/其它来源/);
    });

    it("通过 classifyError 透传原 failure（不论 source 参数如何）", () => {
      // 即便 classifyError 用了不同的 source 参数，FederationError 自己携带 source
      const original: FederationFailure = {
        kind: "empty",
        source: "openalex",
        query: "q",
      };
      const classified = classifyError("openlibrary", new FederationError(original));
      expect(classified).toEqual(original);
    });

    it("可被 instanceof Error 捕获", () => {
      const err = new FederationError({
        kind: "unreachable",
        source: "openalex",
        message: "x",
      });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(FederationError);
    });
  });
});
