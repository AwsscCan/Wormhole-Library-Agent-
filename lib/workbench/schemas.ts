import { z } from "zod";

const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const personalEdge = z.object({
  id: z.string().min(1), source: z.string().min(1), target: z.string().min(1),
  label: z.string().trim().min(1).max(160), note: z.string().max(4000).optional(),
}).strict();
const view = z.object({
  nodePositions: z.record(position), hiddenNodeIds: z.array(z.string().min(1)).max(2000),
  personalEdges: z.array(personalEdge).max(1000),
}).strict();
const readingPlan = z.object({
  goal: z.string().trim().min(1).max(1000), orderedResourceIds: z.array(z.string().min(1)).max(5000),
  estimatedMinutes: z.number().int().nonnegative().max(100000),
  completionDefinition: z.string().trim().min(1).max(2000), nextAction: z.string().trim().min(1).max(2000),
  completedResourceIds: z.array(z.string().min(1)).max(5000),
}).strict();
const evidenceGraph = z.object({
  claims: z.array(z.object({ id: z.string().min(1), text: z.string().trim().min(1).max(4000) }).strict()).max(5000),
  evidence: z.array(z.object({ id: z.string().min(1), resourceId: z.string().min(1), noteId: z.string().min(1).optional(), label: z.string().trim().min(1).max(1000) }).strict()).max(10000),
  links: z.array(z.object({ id: z.string().min(1), claimId: z.string().min(1), evidenceId: z.string().min(1), role: z.enum(["supports", "refutes", "background", "to_verify"]) }).strict()).max(20000),
  draftParagraphs: z.array(z.object({
    id: z.string().min(1), text: z.string().max(20000),
    sourceRefs: z.array(z.object({ resourceId: z.string().min(1), noteId: z.string().min(1).optional() }).strict()).max(1000),
  }).strict()).max(5000),
}).strict();

export const workbenchUpdateSchema = z.object({
  expectedVersion: z.number().int().nonnegative(), surpriseLevel: z.enum(["low", "medium", "high"]),
  readingPlan, views: z.object({ reading: view, concept: view, evidence: view }).strict(),
  resourceStates: z.record(z.object({ status: z.enum(["queued", "reading", "complete"]), tags: z.array(z.string().trim().min(1).max(80)).max(100), note: z.string().max(10000).optional() }).strict()),
  evidenceGraph,
}).strict();

export const recommendationRequestSchema = z.object({
  surpriseLevel: z.enum(["low", "medium", "high"]), limit: z.number().int().min(1).max(100).default(20),
}).strict();

export const feedbackSchema = z.object({
  recommendationId: z.string().min(1), feedback: z.enum(["useful", "too_far", "too_hard"]),
}).strict();
