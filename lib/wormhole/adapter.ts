/**
 * Engine ↔ UI Adapter Layer
 *
 * Bridges the paper-level engine output (PaperWormholeCard, from pkg03
 * WormholeEngineImpl) to the concept-level UI contract (WormholeCard),
 * and maps API-layer types (FeedbackRequest / MemorySummary) to the
 * paper-level types the real engine consumes.
 *
 * Also keeps a card-id → PaperCard registry so feedback on a wormhole
 * can be compiled against the actual target paper.
 */

import type {
  ConceptTag,
  Feedback,
  FeedbackRequest,
  MemorySnapshot,
  MemorySummary,
  PaperCard,
  PaperWormholeCard,
  WormholeCard,
} from "../types";
import {
  findLivingBooksByConceptFallback,
  findResourcesByConceptFallback,
} from "../mock/fallbackEngine";

/* ------------------- paper wormhole → UI card ------------------- */

/** cardId → target paper（demo 单进程内存注册表，供 feedback 反查） */
const paperByCardId = new Map<string, PaperCard>();

export function registerPaperWormhole(cardId: string, paper: PaperCard): void {
  paperByCardId.set(cardId, paper);
}

export function lookupPaperByTargetId(targetId: string): PaperCard | undefined {
  return paperByCardId.get(targetId);
}

/**
 * Pick the destination concept: prefer target-paper concepts that have
 * library resources on them (so the UI card always lands somewhere real),
 * falling back to the highest-scoring concept.
 */
function pickDestinationConcept(
  targetPaper: PaperCard,
  targetConcepts: ConceptTag[]
): { id: string; name: string } {
  const candidates = targetConcepts.length > 0 ? targetConcepts : targetPaper.concepts;
  const byId = new Map<string, ConceptTag>();
  for (const c of targetPaper.concepts) byId.set(c.id, c);

  // 1) any paper concept with resources on it, highest score first
  const covered = [...targetPaper.concepts]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .find((c) => findResourcesByConceptFallback(c.id).length > 0);
  if (covered) return { id: covered.id, name: covered.name };

  // 2) highest-scoring candidate concept that exists in the graph-adjacent set
  const best = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (best) return { id: best.id, name: best.name };

  // 3) absolute fallback: first concept of the paper
  const first = targetPaper.concepts[0] ?? byId.values().next().value;
  return { id: first?.id ?? "c_ai_agent", name: first?.name ?? "AI Agent" };
}

export function toUiWormholeCards(
  engineCards: PaperWormholeCard[]
): WormholeCard[] {
  const out: WormholeCard[] = [];

  for (const card of engineCards) {
    const dest = pickDestinationConcept(card.targetPaper, card.targetConcepts);

    // path: start concept → target concepts → destination concept (names + ids)
    const startNames = card.startConcepts.slice(0, 2).map((c) => c.name);
    const startIds = card.startConcepts.slice(0, 2).map((c) => c.id);
    const midNames = card.targetConcepts.slice(0, 2).map((c) => c.name);
    const midIds = card.targetConcepts.slice(0, 2).map((c) => c.id);

    const pathNames = [...new Set([...startNames, ...midNames, dest.name])];
    const pathIds = [...new Set([...startIds, ...midIds, dest.id])];

    const resources = findResourcesByConceptFallback(dest.id);
    const livingBooks = findLivingBooksByConceptFallback(dest.id);
    if (resources.length === 0 && livingBooks.length === 0) continue; // 契约：落点必须有资源或人物

    registerPaperWormhole(card.id, card.targetPaper);

    out.push({
      id: card.id,
      path: pathNames,
      pathConceptIds: pathIds,
      destination: dest.name,
      destinationConceptId: dest.id,
      explanation: card.explanation,
      scores: {
        novelty: card.scores.novelty,
        noveltyFit: card.scores.bridge,
        bridge: card.scores.bridge,
        quality: card.scores.quality,
        diversity: card.scores.novelty,
        final: card.scores.final,
      },
      resources,
      livingBooks,
    });
  }

  return out;
}

/* ------------------- MemorySummary → MemorySnapshot ------------------- */

const LEVEL_MAP: Record<string, NonNullable<MemorySnapshot["difficulty"]["preferredLevel"]>> = {
  intro: "beginner",
  undergrad: "undergrad",
  graduate: "graduate",
  research: "research",
};

export function toMemorySnapshot(summary: MemorySummary): MemorySnapshot {
  return {
    reading: {
      languagePref:
        summary.reading.language === "zh_first"
          ? "zh_first"
          : summary.reading.language === "en_first"
            ? "en_first"
            : "no_pref",
      summaryFirst: summary.reading.summaryFirst,
      resultCount: summary.reading.maxResults,
      prefEmpirical: summary.reading.prefEmpirical,
      prefTheoretical: summary.reading.prefTheoretical,
    },
    difficulty: {
      preferredLevel: LEVEL_MAP[summary.difficulty.preferredLevel] ?? "undergrad",
      mathTolerance: summary.difficulty.mathTolerance,
      theoryTolerance: summary.difficulty.theoryTolerance,
    },
    citation: {
      defaultStyle: summary.citation?.defaultStyle,
    },
    serendipity: {
      defaultSlider: summary.serendipity.defaultSlider,
      likedDomains: [...summary.serendipity.likedDomains],
      dislikedDomains: [...summary.serendipity.dislikedDomains],
    },
  };
}

/* ------------------- FeedbackRequest → paper Feedback ------------------- */

/** API 层的距离类 rating（冻结契约合规：走 Feedback.distanceRating 可选字段） */
const DISTANCE_RATINGS = ["too_close", "too_far", "not_relevant"] as const;
type DistanceRating = (typeof DISTANCE_RATINGS)[number];

function isDistanceRating(r: FeedbackRequest["rating"]): r is DistanceRating {
  return (DISTANCE_RATINGS as readonly string[]).includes(r);
}

/**
 * Map API feedback ratings onto the paper-level compiler's ratings.
 * 03-02 补交：六种 API rating 全量映射，不再有 null 路径，调用方无需
 * 回退 compileFeedbackFallback。其中距离类 rating（too_close / too_far /
 * not_relevant）映射到 Feedback.distanceRating 可选字段 —— 冻结契约
 * 只允许加可选字段，rating 联合保持原 5 值；编译器优先消费
 * distanceRating，占位的 rating 值不会被消费。
 */
export function toPaperFeedback(req: FeedbackRequest): Feedback {
  const targetType: Feedback["targetType"] =
    req.targetType === "wormhole" ? "wormhole" : "paper";

  if (isDistanceRating(req.rating)) {
    return {
      targetType,
      targetId: req.targetId,
      rating: "just_right", // 中性占位，编译器命中 distanceRating 后提前返回
      distanceRating: req.rating,
      freeText: req.freeText ?? null,
    };
  }

  const ratingMap: Record<
    Exclude<FeedbackRequest["rating"], DistanceRating>,
    Feedback["rating"]
  > = {
    too_hard: "too_hard",
    just_right: "just_right",
    useful: "interesting",
  };

  return {
    targetType,
    targetId: req.targetId,
    rating: ratingMap[req.rating],
    freeText: req.freeText ?? null,
  };
}

/* ------------------- MemorySnapshot → MemorySummary ------------------- */

const LEVEL_MAP_INV: Record<string, MemorySummary["difficulty"]["preferredLevel"]> = {
  beginner: "intro",
  undergrad: "undergrad",
  graduate: "graduate",
  research: "research",
};

/**
 * 03-03 补交：正式 MemorySnapshot → UI 层 MemorySummary 的单一转换层。
 *
 * 编排层以 MemorySnapshot 为单一事实源（正式 getMemory / applyPatch /
 * saveSnapshot 读写）；MemorySummary 仅作为 UI 视图，由快照字段覆盖
 * demo 基线（基线提供 social / resourceTypeOrder 等快照不跟踪的字段）。
 */
export function toMemorySummary(
  snapshot: MemorySnapshot,
  base: MemorySummary
): MemorySummary {
  const language: MemorySummary["reading"]["language"] =
    snapshot.reading.languagePref === "zh_first"
      ? "zh_first"
      : snapshot.reading.languagePref === "en_first"
        ? "en_first"
        : "any";

  return {
    ...base,
    reading: {
      ...base.reading,
      language,
      summaryFirst: snapshot.reading.summaryFirst ?? base.reading.summaryFirst,
      maxResults: snapshot.reading.resultCount ?? base.reading.maxResults,
      ...(snapshot.reading.prefEmpirical !== undefined
        ? { prefEmpirical: snapshot.reading.prefEmpirical }
        : {}),
      ...(snapshot.reading.prefTheoretical !== undefined
        ? { prefTheoretical: snapshot.reading.prefTheoretical }
        : {}),
    },
    difficulty: {
      ...base.difficulty,
      preferredLevel:
        snapshot.difficulty.preferredLevel != null
          ? LEVEL_MAP_INV[snapshot.difficulty.preferredLevel] ??
            base.difficulty.preferredLevel
          : base.difficulty.preferredLevel,
      mathTolerance: snapshot.difficulty.mathTolerance ?? base.difficulty.mathTolerance,
      ...(snapshot.difficulty.theoryTolerance !== undefined
        ? { theoryTolerance: snapshot.difficulty.theoryTolerance }
        : {}),
    },
    serendipity: {
      ...base.serendipity,
      defaultSlider: snapshot.serendipity.defaultSlider ?? base.serendipity.defaultSlider,
      likedDomains: [...snapshot.serendipity.likedDomains],
      dislikedDomains: [...snapshot.serendipity.dislikedDomains],
    },
    citation: snapshot.citation?.defaultStyle
      ? { defaultStyle: snapshot.citation.defaultStyle }
      : base.citation,
  };
}
