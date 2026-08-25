import type { EvidenceGraph } from "./types";

export function sessionResourceHref(sessionId: string, resourceId: string) {
  const encodedSession = encodeURIComponent(sessionId);
  return `/research/${encodedSession}/map?sessionId=${encodedSession}&resourceId=${encodeURIComponent(resourceId)}`;
}

export function buildEvidenceBacklinks(graph: EvidenceGraph) {
  return new Map(graph.draftParagraphs.map((paragraph) => [paragraph.id, paragraph.sourceRefs]));
}

export function validateEvidenceGraph(graph: EvidenceGraph) {
  const claims = new Set(graph.claims.map((claim) => claim.id));
  const evidence = new Set(graph.evidence.map((item) => item.id));
  const errors: string[] = [];
  for (const link of graph.links) {
    if (!claims.has(link.claimId)) errors.push(`Evidence link ${link.id} references missing claim ${link.claimId}`);
    if (!evidence.has(link.evidenceId)) errors.push(`Evidence link ${link.id} references missing evidence ${link.evidenceId}`);
  }
  return errors;
}
