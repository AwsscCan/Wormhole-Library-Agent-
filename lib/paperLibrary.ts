/**
 * Paper Library Loader
 *
 * Loads the seed paper library (data/seed-papers.json) into the
 * paper/reference/concept maps the real wormhole engine consumes.
 *
 * Design doc 10: the engine needs paper-level citation graph,
 * not just the concept graph — this module is that data source.
 */

import type { ConceptTag, PaperCard, PaperId } from "./types";
import seedPapersData from "../data/seed-papers.json";

export interface PaperLibrary {
  papers: Map<PaperId, PaperCard>;
  /** paperId → papers it cites (referencedWorks) */
  references: Map<PaperId, PaperId[]>;
  /** paperId → concept tags */
  concepts: Map<PaperId, ConceptTag[]>;
}

type SeedPaper = {
  id: string;
  title: string;
  doi: string | null;
  year: number;
  authors: string[];
  citedByCount: number;
  abstract: string | null;
  concepts: ConceptTag[];
  openAccess: boolean;
  openAccessPdf: string | null;
  referencedWorks: string[];
};

let _cached: PaperLibrary | null = null;

export function loadPaperLibrary(): PaperLibrary {
  if (_cached) return _cached;

  const raw = (
    Array.isArray(seedPapersData)
      ? seedPapersData
      : ((seedPapersData as { papers?: unknown[] }).papers ?? [])
  ) as SeedPaper[];

  const papers = new Map<PaperId, PaperCard>();
  const references = new Map<PaperId, PaperId[]>();
  const concepts = new Map<PaperId, ConceptTag[]>();

  for (const p of raw) {
    papers.set(p.id, {
      id: p.id,
      title: p.title,
      doi: p.doi,
      year: p.year,
      authors: p.authors,
      citedByCount: p.citedByCount,
      abstract: p.abstract,
      concepts: p.concepts,
      openAccess: p.openAccess,
      openAccessPdf: p.openAccessPdf,
    });
    references.set(p.id, p.referencedWorks ?? []);
    concepts.set(p.id, p.concepts ?? []);
  }

  _cached = { papers, references, concepts };
  return _cached;
}

/**
 * Pick the best start paper for a set of concept ids:
 * highest concept overlap, ties broken by citation count.
 * Returns null when no paper shares any concept (caller falls back).
 */
export function pickStartPaperId(startConceptIds: string[]): PaperId | null {
  if (startConceptIds.length === 0) return null;
  const lib = loadPaperLibrary();
  const wanted = new Set(startConceptIds);

  let bestId: PaperId | null = null;
  let bestOverlap = 0;
  let bestCitations = -1;

  for (const [id, paper] of lib.papers) {
    let overlap = 0;
    for (const c of paper.concepts) {
      if (wanted.has(c.id)) overlap++;
    }
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && overlap > 0 && paper.citedByCount > bestCitations)
    ) {
      bestOverlap = overlap;
      bestCitations = paper.citedByCount;
      bestId = id;
    }
  }

  return bestOverlap > 0 ? bestId : null;
}
