import "server-only";
import { randomUUID } from "node:crypto";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { getPrisma } from "@/lib/db/prisma";
import { principalOwnerKey } from "@/lib/research/principal";

export type WorkspaceLivingProfile = { id: string; ownerId: string; displayMode: "anonymous" | "named"; topics: string[]; willingTypes: string[]; optIn: boolean; updatedAt: string };
export type DiscoverableLivingProfile = { id: string; displayMode: "anonymous" | "named"; topics: string[]; willingTypes: string[]; updatedAt: string };
const safeList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
function dto(row: { id: string; ownerId: string; displayMode: string; topicsJson: string; willingTypesJson: string; optIn: boolean; updatedAt: Date }) { let topics: unknown = []; let willingTypes: unknown = []; try { topics = JSON.parse(row.topicsJson); willingTypes = JSON.parse(row.willingTypesJson); } catch { /* recover as empty profile */ } return { id: row.id, ownerId: row.ownerId, displayMode: row.displayMode === "named" ? "named" as const : "anonymous" as const, topics: safeList(topics), willingTypes: safeList(willingTypes), optIn: Boolean(row.optIn), updatedAt: row.updatedAt.toISOString() }; }
function owner(principal: CurrentPrincipal) { return principalOwnerKey(principal); }
export async function getWorkspaceLivingProfile(principal: CurrentPrincipal): Promise<WorkspaceLivingProfile> { const ownerId = owner(principal); const row = await getPrisma().livingBookWorkspaceProfile.findUnique({ where: { ownerId } }); return row ? dto(row) : { id: `workspace:${ownerId}`, ownerId, displayMode: "anonymous", topics: [], willingTypes: [], optIn: false, updatedAt: new Date(0).toISOString() }; }
export async function saveWorkspaceLivingProfile(principal: CurrentPrincipal, input: { displayMode?: "anonymous" | "named"; topics: string[]; willingTypes: string[]; optIn: boolean }) { const ownerId = owner(principal); const now = new Date(); const row = await getPrisma().livingBookWorkspaceProfile.upsert({ where: { ownerId }, create: { id: randomUUID(), ownerId, displayMode: input.displayMode ?? "anonymous", topicsJson: JSON.stringify(safeList(input.topics)), willingTypesJson: JSON.stringify(safeList(input.willingTypes)), optIn: input.optIn, createdAt: now, updatedAt: now }, update: { displayMode: input.displayMode ?? "anonymous", topicsJson: JSON.stringify(safeList(input.topics)), willingTypesJson: JSON.stringify(safeList(input.willingTypes)), optIn: input.optIn, updatedAt: now } }); return dto(row); }

export async function listDiscoverableLivingProfiles(principal: CurrentPrincipal): Promise<DiscoverableLivingProfile[]> {
  const rows = await getPrisma().livingBookWorkspaceProfile.findMany({ where: { optIn: true, NOT: { ownerId: owner(principal) } }, orderBy: { updatedAt: "desc" }, take: 100 });
  return rows.map((row) => { const item = dto(row); return { id: `workspace:${row.id}`, displayMode: item.displayMode, topics: item.topics, willingTypes: item.willingTypes, updatedAt: item.updatedAt }; });
}

export async function findDiscoverableLivingProfile(livingBookId: string) {
  if (!livingBookId.startsWith("workspace:")) return null;
  const id = livingBookId.slice("workspace:".length);
  return getPrisma().livingBookWorkspaceProfile.findFirst({ where: { id, optIn: true } });
}
