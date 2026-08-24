import type { CurrentPrincipal } from "@/lib/auth/principal";
import type { SourceProvenance } from "@/lib/types";

export type EvidenceItem = {
  id: string; title: string; excerpt: string; provenance: SourceProvenance; url?: string;
  verificationStatus: "verified" | "needs_review" | "rejected"; userConfirmedAt?: string;
};
export type WritingStage = "evidence" | "verified_sources" | "outline" | "draft" | "evidence_link" | "human_review" | "export";
export type WritingCheckpoint = { id: string; ownerId: string; sessionId: string; stage: WritingStage; artifactId?: string; createdAt: string };
export type DraftResult = { markdown: string; citations: Array<{ evidenceId: string; marker: string }>; source: "provider" | "deterministic"; checkpointId: string; missingEvidence?: string[] };
export type ResearchSessionReadPort = { id: string; ownerId: string; researchQuestion: string; evidenceIds: string[] };
export type WritingPorts = {
  session(input: { principal: CurrentPrincipal; sessionId: string }): Promise<ResearchSessionReadPort | null>;
  evidence(id: string): Promise<EvidenceItem | null>;
  checkpoint?(checkpoint: WritingCheckpoint): Promise<void>;
  discover?(input: { principal: CurrentPrincipal; sessionId: string; researchQuestion: string }): Promise<EvidenceItem[]>;
};
