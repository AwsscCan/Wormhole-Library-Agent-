/**
 * Concept Vector Operations
 *
 * Provides set-based and vector-based operations for concept comparison.
 * Used by the wormhole scoring module for novelty computation.
 *
 * Design doc 10.2: novelty = len(only_B) / len(concepts_B_filtered)
 * This is a set-difference operation, not an embedding similarity.
 */

import type { ConceptTag } from "../types";
import { loadConceptGraph } from "./graph";

/**
 * Filter concepts to only meaningful ones (level >= 1, score > 0.3).
 * Per design doc 10.2: broad categories (level=0) are excluded to
 * avoid trivial overlaps (e.g., both papers are "Computer Science").
 */
export function filterMeaningful(concepts: ConceptTag[]): ConceptTag[] {
  return concepts.filter((c) => c.level >= 1 && c.score > 0.3);
}

/**
 * Compute novelty score: how many of B's concepts are NOT in A.
 *
 * novelty = |B - A| / |B|
 *
 * A high novelty means B covers concepts that A doesn't — this is
 * the "knowledge wormhole" effect: jumping to a different domain.
 *
 * Returns 0 if B has no meaningful concepts.
 */
export function computeNovelty(conceptsA: ConceptTag[], conceptsB: ConceptTag[]): number {
  const filteredA = filterMeaningful(conceptsA);
  const filteredB = filterMeaningful(conceptsB);

  if (filteredB.length === 0) return 0;

  const namesA = new Set(filteredA.map((c) => c.name));
  const namesB = new Set(filteredB.map((c) => c.name));

  const onlyB = [...namesB].filter((name) => !namesA.has(name));
  return onlyB.length / namesB.size;
}

/**
 * Compute the novelty_fit: how well the actual novelty matches the
 * slider's target novelty.
 *
 * target_novelty = slider_value / 100
 * novelty_fit = 1 - |novelty - target_novelty|
 *
 * A perfect match gives 1.0; a complete miss gives ~0.0.
 */
export function computeNoveltyFit(novelty: number, sliderValue: number): number {
  const targetNovelty = sliderValue / 100;
  return Math.max(0, 1 - Math.abs(novelty - targetNovelty));
}

/**
 * Compute the overlap ratio between two concept sets.
 * overlap = |A ∩ B| / |A ∪ B| (Jaccard index)
 */
export function computeOverlap(conceptsA: ConceptTag[], conceptsB: ConceptTag[]): number {
  const filteredA = filterMeaningful(conceptsA);
  const filteredB = filterMeaningful(conceptsB);

  const setA = new Set(filteredA.map((c) => c.name));
  const setB = new Set(filteredB.map((c) => c.name));

  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.length / union.size;
}

/**
 * Get the set of concept names unique to B (not in A).
 */
export function getUniqueConcepts(conceptsA: ConceptTag[], conceptsB: ConceptTag[]): string[] {
  const filteredA = filterMeaningful(conceptsA);
  const filteredB = filterMeaningful(conceptsB);

  const namesA = new Set(filteredA.map((c) => c.name));
  const namesB = new Set(filteredB.map((c) => c.name));

  return [...namesB].filter((name) => !namesA.has(name));
}

/**
 * Convert a concept list to a weighted bag-of-concepts vector.
 * Keys are concept names, values are their scores.
 * Useful for cosine-like comparisons if needed.
 */
export function toConceptVector(concepts: ConceptTag[]): Map<string, number> {
  const filtered = filterMeaningful(concepts);
  const vec = new Map<string, number>();
  for (const c of filtered) {
    vec.set(c.name, c.score);
  }
  return vec;
}

/**
 * Compute a weighted cosine-like similarity between two concept vectors.
 * Uses the bag-of-concepts representation.
 */
export function conceptSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, val] of vecA) {
    normA += val * val;
    if (vecB.has(key)) {
      dotProduct += val * vecB.get(key)!;
    }
  }
  for (const [, val] of vecB) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ---------------- 责任书 3.2 公开入口 ---------------- */

/**
 * 责任书 3.2 公开入口：两个概念向量的余弦相似度。
 * 即 conceptSimilarity 的别名（签名 cosine(a, b): number）。
 */
export function cosine(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  return conceptSimilarity(a, b);
}

/**
 * 责任书 3.2 公开入口：构建用户概念向量（number[] 形式）。
 * 以当前概念图全部概念 id 排序后作为固定词表，起点概念记 1、其余记 0，
 * 保证同一词表下向量可比较、可复现（与 cosine/buildUserVector 配合使用）。
 * userId 当前不影响向量，留作将来按用户记忆加权。
 */
export function buildUserVector(
  userId: string,
  startConceptIds: string[]
): number[] {
  void userId;
  const vocabulary = [...loadConceptGraph().nodes.keys()].sort();
  const startSet = new Set(startConceptIds);
  return vocabulary.map((id) => (startSet.has(id) ? 1 : 0));
}
