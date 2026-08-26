import { sessionResourceHref } from "./links";
import type { ExplorationRecommendation, WorkbenchState } from "./types";

export const WORKBENCH_VIEWS = ["reading", "concept", "evidence"] as const;
export type WorkbenchView = typeof WORKBENCH_VIEWS[number];

export function paginateWorkbenchItems<T>(items: T[], requestedPage: number, pageSize = 25) {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1);
  return { items: items.slice(page * safeSize, page * safeSize + safeSize), page, pageCount, total: items.length };
}

export function buildWorkbenchViewModel(state: WorkbenchState, recommendations: ExplorationRecommendation[]) {
  return {
    sessionId: state.sessionId,
    tabs: [
      { id: "reading" as const, label: "阅读计划", count: state.readingPlan.orderedResourceIds.length },
      { id: "concept" as const, label: "概念图", count: Object.keys(state.views.concept.nodePositions).length },
      { id: "evidence" as const, label: "证据图", count: state.evidenceGraph.claims.length },
    ],
    resources: recommendations.map((item) => ({
      id: item.resourceId, title: item.title, href: sessionResourceHref(state.sessionId, item.resourceId), explanation: item.explanation,
    })),
  };
}
