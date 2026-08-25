import { z } from "zod";

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const nodeOverrideSchema = z.object({
  position: positionSchema.optional(),
  pinned: z.boolean().optional(),
  hidden: z.boolean().optional(),
  label: z.string().trim().min(1).max(120).optional(),
  note: z.string().max(4000).optional(),
  updatedAt: z.string().datetime(),
});
const personalEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.literal("personal_note"),
  label: z.string().max(120).optional(),
  note: z.string().max(4000).optional(),
});

export const createResearchSessionSchema = z.object({
  researchQuestion: z.string().trim().min(1).max(500),
  writingTopic: z.string().trim().min(1).max(500).optional(),
}).strict();

export const graphUpdateSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  nodeOverrides: z.record(nodeOverrideSchema),
  hiddenSystemEdgeIds: z.array(z.string().min(1)).max(2000),
  personalEdges: z.array(personalEdgeSchema).max(1000),
}).strict();

export const nodeActionSchema = z.object({
  action: z.enum(["search", "library", "add_evidence"]),
  nodeId: z.string().min(1),
  topic: z.string().trim().min(1).max(500),
  resourceId: z.string().min(1).optional(),
}).strict();

export type CreateResearchSessionInput = z.infer<typeof createResearchSessionSchema>;
export type GraphUpdateInput = z.infer<typeof graphUpdateSchema>;
export type NodeActionInput = z.infer<typeof nodeActionSchema>;
