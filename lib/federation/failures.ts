/**
 * Source Federation failure classifier (v3.2 package 02)
 *
 * 把任意错误归一为 FederationFailure；这就是"不撒谎降级"承诺的根。
 *
 * 设计原则：
 *  - 永不发明第三种状态 —— 只有这几种 kind，不写 "unknown"
 *  - 永远带上 source —— 上层/前端能精确告诉用户"哪个源"不可达
 *  - 文本走 getFailureMessage —— 品牌对齐（一律中文，暖性话术）
 */

import type { FederationFailure, SourceKind } from "./types";

/**
 * 把任意错误归一为 FederationFailure。
 * - TypeError / "fetch failed" / "ENOTFOUND" / "ECONNRESET" → unreachable
 * - "aborted" / "timeout" → unreachable（包一层"超时"措辞）
 * - FederationError 实例 → 透传原 failure（throw/catch 不丢语义）
 * - 其它 → 兜底 unreachable
 */
export function classifyError(
  source: SourceKind,
  err: unknown,
  context: { query?: string } = {},
): FederationFailure {
  if (err instanceof FederationError) {
    // 透传：让 throw-catch 不丢"哪个源失败"的语义
    return err.failure;
  }

  const message = err instanceof Error ? err.message : String(err);

  // AbortError / timeout 单独标注
  if (/aborted|timeout/i.test(message)) {
    return { kind: "unreachable", source, message: `请求超时：${message}` };
  }

  // fetch 失败的常见模式
  if (
    err instanceof TypeError ||
    /fetch failed|network|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message)
  ) {
    return { kind: "unreachable", source, message };
  }

  // parse 失败：message 通常含"JSON"或"Unexpected"
  if (/JSON|Unexpected token|SyntaxError/i.test(message)) {
    return { kind: "parse_error", source, body: message.slice(0, 200) };
  }

  // 兜底：当作不可达 + 附 query 上下文（如果给了）
  const fullMessage = context.query
    ? `${message}（query=${context.query}）`
    : message;
  return { kind: "unreachable", source, message: fullMessage };
}

/**
 * HTTP 状态码 → FederationFailure 分类
 *  - 429 → rate_limited（带 Retry-After）
 *  - 5xx → unreachable（不是 parse 错，是服务端没返可用响应）
 *  - 4xx 非 429 → parse_error（请求本身或响应结构异常）
 *  - 2xx 不应走这里 —— 但兜底 parse_error
 */
export function classifyHttpFailure(
  source: SourceKind,
  status: number,
  body: string,
  retryAfterHeader?: string,
): FederationFailure {
  if (status === 429) {
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    return Number.isFinite(retryAfterSec) && retryAfterSec >= 0
      ? { kind: "rate_limited", source, retryAfterMs: retryAfterSec * 1000 }
      : { kind: "rate_limited", source };
  }
  if (status >= 500) {
    return {
      kind: "unreachable",
      source,
      message: `服务端错误 HTTP ${status}`,
    };
  }
  if (status >= 400) {
    return {
      kind: "parse_error",
      source,
      body: body.slice(0, 200),
    };
  }
  // 2xx 不应进来（caller 应区分 ok），兜底
  return {
    kind: "parse_error",
    source,
    body: `unexpected 2xx path: ${body.slice(0, 200)}`,
  };
}

/**
 * 多源失败合并：
 *  - 空 → null（无失败就无失败）
 *  - 单元素 → 原样返回
 *  - 同 kind 多个 → 取第一个（不假装合并）
 *  - 不同 kind → 包装为 unreachable + 列出全部 kind 摘要
 */
export function combineFailures(
  failures: readonly FederationFailure[],
): FederationFailure | null {
  if (failures.length === 0) return null;
  if (failures.length === 1) return failures[0];
  const firstKind = failures[0]!.kind;
  if (failures.every((f) => f.kind === firstKind)) {
    return failures[0];
  }
  // 异种 —— 用 unreachable 兜底，message 里标明其它 kind
  const kinds = Array.from(new Set(failures.map((f) => f.kind))).join("/");
  return {
    kind: "unreachable",
    source: failures[0]!.source,
    message: `${failures.length} 个源失败：${kinds}`,
  };
}

/**
 * 给前端 / 日志用的失败文案 —— 品牌口号：
 * "馆藏来源暂时不可用；这不是'无结果'，你的会话和图编辑已保留。"
 *
 * 约定：
 *  - 中文
 *  - 句首必含 source 名（让用户知道是哪个）
 *  - 必给可操作的下一步或安抚语
 */
export function getFailureMessage(failure: FederationFailure): string {
  switch (failure.kind) {
    case "unreachable":
      return `${failure.source} 暂时不可达：${failure.message}。查询仍然成立，可以稍后重试。`;
    case "rate_limited":
      return failure.retryAfterMs !== undefined
        ? `${failure.source} 这会儿请求太多，约 ${Math.ceil(failure.retryAfterMs / 1000)} 秒后可继续。其它来源仍在工作。`
        : `${failure.source} 这会儿请求太多，其它来源仍在工作，可以稍后再来。`;
    case "parse_error":
      return `${failure.source} 返回的数据这次无法识别。我们没把别的内容伪装成结果，可以稍后重试。`;
    case "empty":
      return `${failure.source} 这次没有「${failure.query}」相关条目。你可以换个关键词试试。`;
    case "circuit_open": {
      const remainMs = Math.max(0, failure.cooldownUntil - Date.now());
      return `${failure.source} 已熔断，约 ${Math.ceil(remainMs / 1000)} 秒后自动恢复。其它来源仍在工作。`;
    }
  }
}

/**
 * 显式抛错类 —— 让上层 throw 后可被 classifyError 透传，
 * 不丢失"哪个具体源失败"的语义。
 *
 * 用法：
 *   throw new FederationError({ kind: "rate_limited", source: "openalex", retryAfterMs: 5000 });
 *   // ... catch 路径里：
 *   const f = classifyError("openalex", err);  // 直接拿到 rate_limited，不再被吞
 */
export class FederationError extends Error {
  constructor(public readonly failure: FederationFailure) {
    super(getFailureMessage(failure));
    this.name = "FederationError";
  }
}
