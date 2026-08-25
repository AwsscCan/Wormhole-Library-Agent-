import type { ConceptRef, ResourceCard } from "@/lib/types";

export type CurrentPrincipal = { id: string; mode: "member" | "guest" };
export type SourceProvenance = {
  sourceKind: "openalex" | "openlibrary" | "library" | "seed";
  sourceLabel: string;
  retrievedAt: string;
  externalId?: string;
};
export type SourceTransparentResource = ResourceCard & { provenance: SourceProvenance };
export type TopicLibraryResult = {
  resources: SourceTransparentResource[];
  sourceStatus: "live" | "partial" | "unavailable";
  degraded: boolean;
  message?: string;
};

export type GraphPosition = { x: number; y: number };
export type NodeOverride = {
  position?: GraphPosition;
  pinned?: boolean;
  hidden?: boolean;
  label?: string;
  note?: string;
  updatedAt: string;
};

export type PersonalGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "personal_note";
  label?: string;
  note?: string;
};

export type PersonalGraphState = {
  schemaVersion: 1;
  version: number;
  nodeOverrides: Record<string, NodeOverride>;
  hiddenSystemEdgeIds: string[];
  personalEdges: PersonalGraphEdge[];
};

export type SessionResource = {
  id: string;
  title: string;
  concepts: ConceptRef[];
  sourceLabel?: string;
  sourceUrl?: string;
};

export type SessionSearch = {
  interactionId: string;
  query: string;
  at: string;
  concepts: ConceptRef[];
  resources: SessionResource[];
};

export type SessionWormhole = {
  id: string;
  label: string;
  conceptIds: string[];
};

export type ResearchSession = {
  id: string;
  ownerId: string;
  researchQuestion: string;
  writingTopic?: string;
  interactionIds: string[];
  evidenceIds: string[];
  searches: SessionSearch[];
  wormholes: SessionWormhole[];
  personalGraph: PersonalGraphState;
  /** Internal compare-and-swap revision; clients must not submit it. */
  revision: number;
  recoveryWarning?: "CORRUPT_PERSONAL_GRAPH";
  createdAt: string;
  updatedAt: string;
};

export type SystemGraphNodeKind =
  | "topic"
  | "search"
  | "concept"
  | "resource"
  | "wormhole"
  | "living_book";

export type SystemGraphNode = {
  id: string;
  label: string;
  kind: SystemGraphNodeKind;
  position: GraphPosition;
  resourceId?: string;
};

export type SystemGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "topic_search" | "search_concept" | "concept_resource" | "wormhole";
  system: true;
};

export type SystemGraph = { nodes: SystemGraphNode[]; edges: SystemGraphEdge[] };
export type MergedGraphNode = SystemGraphNode & {
  pinned: boolean;
  hidden: boolean;
  note?: string;
  system: true;
};
export type MergedGraphEdge = SystemGraphEdge | PersonalGraphEdge;
export type MergedGraph = { nodes: MergedGraphNode[]; edges: MergedGraphEdge[] };

export class ResearchError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "EXPIRED_INTERACTION" | "SOURCE_FAILURE" | "AUTH_REQUIRED" | "PRINCIPAL_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}
