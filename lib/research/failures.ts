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
