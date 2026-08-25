import type { GraphPosition, SourceProvenance } from "@/lib/research/types";

export type SurpriseLevel = "low" | "medium" | "high";
export type CandidateBand = "direct" | "adjacent" | "distant";
export type ResourceDifficulty = "introductory" | "intermediate" | "research";
export type BridgeEvidence = {
  kind: "shared_concept" | "citation_path";
  sourceId: string;
  targetId: string;
  label: string;
};

export type ExplorationCandidate = {
  id: string;
  resourceId: string;
  title: string;
  band: CandidateBand;
  relevance: number;
  trust: number;
  accessible: boolean;
  conceptIds: string[];
  conceptLabels?: string[];
  citationIds: string[];
  bridge?: string;
  bridgeEvidence?: BridgeEvidence;
  taskValue?: string;
  taskValueEvidence?: { sourceId: string; label: string };
  effectiveRelevance?: number;
  evidenceBoost?: number;
  memoryBoost?: number;
  decisionTrace?: { sessionEvidenceIds: string[]; sessionContextIds: string[]; personalGraphNodeIds: string[]; memorySnippetIds: string[]; preferenceIds: string[] };
  explanationContext?: string;
  sourceUrl?: string;
  difficulty: ResourceDifficulty;
  estimatedMinutes: number;
  provenance: SourceProvenance;
};

export type RecommendationExplanation = {
  relationship: string;
  bridge: string;
  difficulty: string;
  newValue: string;
};

export type ExplorationRecommendation = ExplorationCandidate & {
  explanation: RecommendationExplanation;
  mmrScore: number;
};

export type UserLayerEdge = { id: string; source: string; target: string; label: string; note?: string };
export type UserViewState = {
  nodePositions: Record<string, GraphPosition>;
  hiddenNodeIds: string[];
  personalEdges: UserLayerEdge[];
};

export type ReadingPlan = {
  goal: string;
  orderedResourceIds: string[];
  estimatedMinutes: number;
  completionDefinition: string;
  nextAction: string;
  completedResourceIds: string[];
};

export type EvidenceRole = "supports" | "refutes" | "background" | "to_verify";
export type EvidenceGraph = {
  claims: Array<{ id: string; text: string }>;
  evidence: Array<{ id: string; resourceId: string; noteId?: string; label: string }>;
  links: Array<{ id: string; claimId: string; evidenceId: string; role: EvidenceRole }>;
  draftParagraphs: Array<{
    id: string;
    text: string;
    sourceRefs: Array<{ resourceId: string; noteId?: string }>;
  }>;
};

export type WorkbenchResourceProjection = {
  resourceId: string;
  recommendationId: string;
  title: string;
  conceptIds: string[];
  conceptLabels: string[];
  sourceLabel: string;
  sourceUrl?: string;
  provenance: SourceProvenance;
  projectedAt: string;
};

export type WorkbenchState = {
  schemaVersion: 1;
  sessionId: string;
  ownerId: string;
  version: number;
  surpriseLevel: SurpriseLevel;
  readingPlan: ReadingPlan;
  views: { reading: UserViewState; concept: UserViewState; evidence: UserViewState };
  resourceStates: Record<string, { status: "queued" | "reading" | "complete"; tags: string[]; note?: string }>;
  resourceProjections: Record<string, WorkbenchResourceProjection>;
  evidenceGraph: EvidenceGraph;
  recoveryWarning?: "CORRUPT_WORKBENCH";
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchUpdateInput = Pick<WorkbenchState, "surpriseLevel" | "readingPlan" | "views" | "resourceStates" | "evidenceGraph"> & {
  expectedVersion: number;
};

export type ExplorationFeedback = "useful" | "too_far" | "too_hard";
export type ExplorationFeedbackEvent = {
  type: "exploration_recommendation_feedback";
  ownerId: string;
  sessionId: string;
  recommendationId: string;
  feedback: ExplorationFeedback;
  occurredAt: string;
};
