/**
 * zod schemas — 与 lib/types.ts 的 API contract 一一对应（冻结）
 */
import { z } from "zod";

export const noteLinkSchema = z.object({
  kind: z.enum(["session", "resource", "graph_node", "draft_section"]),
  targetId: z.string().min(1),
}).strict();

const noteFieldsSchema = {
  title: z.string().min(1).max(160),
  markdown: z.string().max(50_000),
  links: z.array(noteLinkSchema).max(64),
};

export const createNoteSchema = z.object(noteFieldsSchema).strict();

export const updateNoteSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: noteFieldsSchema.title.optional(),
  markdown: noteFieldsSchema.markdown.optional(),
  links: noteFieldsSchema.links.optional(),
}).strict().refine(
  ({ title, markdown, links }) => title !== undefined || markdown !== undefined || links !== undefined,
  { message: "At least one note field must be provided" },
);

export const searchRequestSchema = z.object({
  userId: z.string().min(1),
  query: z.string().min(1),
  taskType: z.enum(["course", "project", "research", "exam", "curiosity"]).optional(),
  level: z.enum(["beginner", "undergraduate", "graduate", "research"]).optional(),
  sliderValue: z.number().min(0).max(100).optional(),
});

const providerFields = {
  name: z.string().min(1).max(120), baseUrl: z.string().min(1).max(2_048), model: z.string().min(1).max(200),
  wireApi: z.enum(["chat_completions", "responses", "anthropic_messages"]), apiKey: z.string().max(4_096).optional(),
};
export const createProviderSchema = z.object(providerFields).strict();
export const updateProviderSchema = z.object({ name: providerFields.name.optional(), baseUrl: providerFields.baseUrl.optional(), model: providerFields.model.optional(), wireApi: providerFields.wireApi.optional(), apiKey: providerFields.apiKey }).strict().refine((value) => Object.keys(value).length > 0, "At least one provider field must be provided");
export const createModelPresetSchema = z.object({ name: z.string().min(1).max(120), providerId: z.string().min(1), model: z.string().min(1).max(200), temperature: z.number().min(0).max(2), maxTokens: z.number().int().min(1).max(200_000) }).strict();
export const createDraftSchema = z.object({ sessionId: z.string().min(1), focus: z.string().min(1).max(500), evidenceIds: z.array(z.string().min(1)).min(3) }).strict();
export const candidateSchema = z.object({ sessionId: z.string().min(1), researchQuestion: z.string().min(1).max(2_000) }).strict();
export const confirmCandidateSchema = z.object({ sessionId: z.string().min(1), evidenceId: z.string().min(1) }).strict();
export const writingStageSchema = z.object({ sessionId: z.string().min(1), stage: z.enum(["evidence", "verified_sources", "outline", "draft", "evidence_link", "human_review", "export"]), content: z.string().max(100_000) }).strict();

export const wormholesRequestSchema = z.object({
  userId: z.string().min(1),
  interactionId: z.string().min(1),
  startConceptIds: z.array(z.string().min(1)).min(1),
  sliderValue: z.number().min(0).max(100),
  maxPaths: z.number().int().min(1).max(10).optional(),
});

export const feedbackRequestSchema = z.object({
  userId: z.string().min(1),
  interactionId: z.string().min(1),
  targetType: z.enum(["resource", "wormhole", "person_match"]),
  targetId: z.string().min(1),
  rating: z.enum(["too_close", "just_right", "too_far", "too_hard", "not_relevant", "useful"]),
  freeText: z.string().optional(),
});

export const matchesRequestSchema = z.object({
  userId: z.string().min(1),
  conceptIds: z.array(z.string().min(1)).min(1),
  mode: z.enum(["collision", "mentor", "similar"]).optional(),
});

export const contactRequestSchema = z.object({
  userId: z.string().min(1),
  personMatchId: z.string().min(1),
  message: z.string().min(1),
});

export const reviewRequestSchema = z.object({
  userId: z.string().min(1),
  paperIds: z.array(z.string().min(1)).min(3).max(5),
  focus: z.enum(["methods", "findings", "timeline"]).optional(),
});
