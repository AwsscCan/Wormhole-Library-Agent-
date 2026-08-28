import { getMemorySnippet, searchPrivateMemory } from "./indexStore";
import type {
  MemorySnippet,
  ProfileAnswer,
  ProfileAnswerCitation,
  ReviewCard,
} from "./types";

/**
 * Grounded profile Q&A / study check.
 *
 * Answers may only cite material the user explicitly selected (by snippet
 * id). If nothing in the selection supports the question, the answer is a
 * clear "unknown" — never an invented fact.
 */

/** Minimum hybrid score for a snippet to count as supporting evidence. */
const EVIDENCE_THRESHOLD = 0.25;
const MAX_CITATIONS = 3;

export async function answerFromSelectedMaterial(input: {
  ownerId: string;
  question: string;
  selectedSourceIds: string[];
  limit?: number;
}): Promise<ProfileAnswer> {
  const { ownerId, question, selectedSourceIds } = input;
  const limit = input.limit ?? MAX_CITATIONS;

  const selected: MemorySnippet[] = [];
  for (const sourceId of selectedSourceIds) {
    const snippet = getMemorySnippet(ownerId, sourceId);
    if (snippet) selected.push(snippet);
  }
  if (selected.length === 0) {
    return {
      status: "unknown",
      question,
      ownerId,
      answer: "当前选定的资料为空或不可用，没有足够依据回答该问题。",
      citations: [],
    };
  }

  // Retrieve only within the user-selected subset.
  const allowed = new Set(selected.map((snippet) => snippet.id));
  const hits = (await searchPrivateMemory({ ownerId, query: question, limit: limit * 3 })).filter(
    (match) => allowed.has(match.id),
  );
  if (hits.length === 0 || hits[0].score < EVIDENCE_THRESHOLD) {
    return {
      status: "unknown",
      question,
      ownerId,
      answer: "当前选定资料中没有支持该问题的依据，无法回答。",
      citations: [],
    };
  }

  const citations: ProfileAnswerCitation[] = hits.slice(0, limit).map((match) => ({
    sourceId: match.id,
    excerpt: match.text.slice(0, 160),
    score: Number(match.score.toFixed(4)),
  }));
  const answer = citations.map((citation, index) => `依据${index + 1}：${citation.excerpt}`).join("\n");
  return {
    status: "supported",
    question,
    ownerId,
    answer: `根据你选定的资料：\n${answer}`,
    citations,
  };
}

/** Study-check review cards generated strictly from user-selected snippets. */
export function makeReviewCards(input: {
  ownerId: string;
  selectedSourceIds: string[];
}): ReviewCard[] {
  const cards: ReviewCard[] = [];
  for (const sourceId of input.selectedSourceIds) {
    const snippet = getMemorySnippet(input.ownerId, sourceId);
    if (!snippet) continue;
    const firstSentence = snippet.text.split(/(?<=[。.!?！？])\s*/)[0] ?? snippet.text.slice(0, 40);
    cards.push({
      sourceId: snippet.id,
      conceptId: snippet.conceptId,
      prompt: `关于「${snippet.conceptId ?? "该笔记"}」，你还记得这条笔记的要点吗？`,
      expected: firstSentence,
    });
  }
  return cards;
}
