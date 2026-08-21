/**
 * zod schemas — 与 lib/types.ts 的 API contract 一一对应（冻结）
 */
import { z } from "zod";

export const searchRequestSchema = z.object({
  userId: z.string().min(1),
  query: z.string().min(1),
  taskType: z.enum(["course", "project", "research", "exam", "curiosity"]).optional(),
  level: z.enum(["beginner", "undergraduate", "graduate", "research"]).optional(),
  sliderValue: z.number().min(0).max(100).optional(),
});

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
