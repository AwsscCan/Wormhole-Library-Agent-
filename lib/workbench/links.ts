import type { EvidenceGraph } from "./types";

export function buildDraftSourceRefs(
  evidence: EvidenceGraph["evidence"],
  selectedEvidenceIds: Set<string>,
  limit = 50,
) {
  return evidence.filter((item) => selectedEvidenceIds.has(item.id)).slice(0, Math.max(0, limit))
    .map((item) => ({ resourceId: item.resourceId, noteId: item.noteId }));
}

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
  const duplicates = (values: string[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
  duplicates(graph.claims.map((claim) => claim.id)).forEach((id) => errors.push(`Duplicate claim id ${id}`));
  duplicates(graph.evidence.map((item) => item.id)).forEach((id) => errors.push(`Duplicate evidence id ${id}`));
  duplicates(graph.links.map((link) => link.id)).forEach((id) => errors.push(`Duplicate evidence link id ${id}`));
  duplicates(graph.draftParagraphs.map((paragraph) => paragraph.id)).forEach((id) => errors.push(`Duplicate draft id ${id}`));
  for (const link of graph.links) {
    if (!claims.has(link.claimId)) errors.push(`Evidence link ${link.id} references missing claim ${link.claimId}`);
    if (!evidence.has(link.evidenceId)) errors.push(`Evidence link ${link.id} references missing evidence ${link.evidenceId}`);
  }
  for (const paragraph of graph.draftParagraphs) {
    if (!paragraph.sourceRefs.length) errors.push(`Draft ${paragraph.id} has no source references`);
    for (const source of paragraph.sourceRefs) {
      const matches = graph.evidence.some((item) => item.resourceId === source.resourceId
        && (source.noteId === undefined || item.noteId === source.noteId));
      if (!matches) errors.push(`Draft ${paragraph.id} references missing source ${source.noteId ?? source.resourceId}`);
    }
  }
  return errors;
}
