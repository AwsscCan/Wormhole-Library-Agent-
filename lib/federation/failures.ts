import type { FederationFailure, SourceKind } from "./types";

export function classifyError(source: SourceKind, err: unknown, context: { query?: string } = {}): FederationFailure {
  if (err instanceof FederationError) return err.failure;
  const message = err instanceof Error ? err.message : String(err);
  if (/aborted|timeout/i.test(message)) return { kind: "unreachable", source, message: `请求超时：${message}` };
  if (err instanceof TypeError || /fetch failed|network|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return { kind: "unreachable", source, message };
  }
  if (/JSON|Unexpected token|SyntaxError/i.test(message)) return { kind: "parse_error", source, body: message.slice(0, 200) };
  return { kind: "unreachable", source, message: context.query ? `${message}（query=${context.query}）` : message };
}

export function classifyHttpFailure(source: SourceKind, status: number, body: string, retryAfterHeader?: string): FederationFailure {
  if (status === 429) {
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    return Number.isFinite(retryAfterSec) && retryAfterSec >= 0
      ? { kind: "rate_limited", source, retryAfterMs: retryAfterSec * 1000 }
      : { kind: "rate_limited", source };
  }
  if (status >= 500) return { kind: "unreachable", source, message: `服务端错误 HTTP ${status}` };
  if (status >= 400) return { kind: "parse_error", source, body: body.slice(0, 200) };
  return { kind: "parse_error", source, body: `unexpected 2xx path: ${body.slice(0, 200)}` };
}

export function combineFailures(failures: readonly FederationFailure[]): FederationFailure | null {
  if (failures.length === 0) return null;
  if (failures.length === 1) return failures[0];
  const firstKind = failures[0]!.kind;
  if (failures.every((f) => f.kind === firstKind)) return failures[0];
  const kinds = Array.from(new Set(failures.map((f) => f.kind))).join("/");
  return { kind: "unreachable", source: failures[0]!.source, message: `${failures.length} 个源失败：${kinds}` };
}

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
    case "circuit_open":
      return `${failure.source} 已熔断，约 ${Math.ceil(Math.max(0, failure.cooldownUntil - Date.now()) / 1000)} 秒后自动恢复。其它来源仍在工作。`;
  }
}

export class FederationError extends Error {
  constructor(public readonly failure: FederationFailure) {
    super(getFailureMessage(failure));
    this.name = "FederationError";
  }
}
