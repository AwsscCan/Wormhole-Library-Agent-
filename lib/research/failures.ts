export type ResearchFailure =
  | "EXPIRED_INTERACTION"
  | "NO_RESOURCES"
  | "SOURCE_FAILURE"
  | "CORRUPT_RECOVERY";

export function explainResearchFailure(failure: ResearchFailure): string {
  switch (failure) {
    case "EXPIRED_INTERACTION":
      return "这次旧检索已过期，但研究会话仍在。请从主题节点重新搜索。";
    case "NO_RESOURCES":
      return "这个主题暂时没有找到资源。可以换一个关键词或稍后重试。";
    case "SOURCE_FAILURE":
      return "馆藏来源暂时不可用；这不是‘无结果’，你的会话和图编辑已保留。";
    case "CORRUPT_RECOVERY":
      return "检测到损坏的本地恢复文件，工作区已安全恢复为空状态，原文件已隔离。";
  }
}

export function explainPrivateWorkspaceError(error: unknown): string {
  if (!(error instanceof ResearchError)) return "研究工作区发生意外错误；没有把它伪装成‘找不到’，请稍后重试。";
  switch (error.code) {
    case "NOT_FOUND":
    case "EXPIRED_INTERACTION":
      return "找不到这个研究工作区，或它不属于当前身份。";
    case "AUTH_REQUIRED":
      return "需要登录用户或访客身份后才能打开这个私有工作区。";
    case "PRINCIPAL_UNAVAILABLE":
      return "身份服务暂时不可用；工作区没有被判定为不存在，请稍后重试。";
    case "SOURCE_FAILURE":
      return "研究工作区服务暂时不可用；这不是‘无结果’或‘找不到’，请稍后重试。";
    case "CONFLICT":
      return "研究工作区已被另一窗口更新，请刷新后重试。";
    case "BAD_REQUEST":
      return "研究工作区请求无效，请返回后重新操作。";
  }
}
import { ResearchError } from "./types";
