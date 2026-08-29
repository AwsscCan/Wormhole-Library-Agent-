import "server-only";
import { readFile } from "node:fs/promises";
import { getPrisma } from "@/lib/db/prisma";
import { principalOwnerKey } from "@/lib/research/principal";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import livingBooksSeed from "@/data/seed-living-books.json";
import { AI_LIVING_BOOK_ID } from "@/lib/livingLibrary/constants";
import { findDiscoverableLivingProfile } from "@/lib/livingLibrary/profile";

type ConversationStatus = "pending" | "accepted" | "declined" | "closed";
type SenderRole = "requester" | "living_book";

export class LivingBookConversationError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "CONFLICT", message: string) {
    super(message);
    this.name = "LivingBookConversationError";
  }
}

function profileFor(livingBookId: string) {
  return livingBooksSeed.livingBooks.find((profile) => profile.id === livingBookId) ?? null;
}

export function canRequestAsyncConversation(livingBookId: string): boolean {
  if (livingBookId === AI_LIVING_BOOK_ID) return true;
  const profile = profileFor(livingBookId);
  return Boolean(
    profile
      && profile.consentState.startsWith("discoverable")
      && profile.willingTypes.includes("async_answer"),
  );
}

function aiReply(question: string): string {
  const topic = question.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
  return `我是 Wormhole AI 馆员。针对「${topic || "这个问题"}」，我会先帮你拆成可检索的概念、优先给出可打开的来源，并标注哪些结论需要你回到原文核验。你也可以让我把下一步整理成研究问题、阅读计划或写作提纲。`;
}

export function normalizeSharedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function owner(principal: CurrentPrincipal): string {
  return principalOwnerKey(principal);
}

function toConversationDto(record: {
  id: string; livingBookId: string; status: string; createdAt: Date; updatedAt: Date; requesterOwnerId: string; targetOwnerId: string | null;
  messages: { id: string; senderRole: string; body: string; createdAt: Date }[];
  sharedResources: { id: string; sharedByRole: string; title: string; url: string; sourceLabel: string | null; createdAt: Date }[];
  assetGrants: { id: string; assetReference: string; grantedByRole: string; revokedAt: Date | null; createdAt: Date }[];
}, viewerOwnerId?: string) {
  return {
    id: record.id,
    livingBookId: record.livingBookId,
    status: record.status as ConversationStatus,
    viewerRole: viewerOwnerId && record.targetOwnerId === viewerOwnerId ? "living_book" as const : "requester" as const,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    messages: record.messages.map((message) => ({ ...message, senderRole: message.senderRole as SenderRole, createdAt: message.createdAt.toISOString() })),
    sharedResources: record.sharedResources.map((resource) => ({ ...resource, sourceLabel: resource.sourceLabel ?? undefined, createdAt: resource.createdAt.toISOString() })),
    sharedAssets: record.assetGrants.filter((grant) => !grant.revokedAt).map((grant) => ({ id: grant.id, assetId: grant.assetReference, sharedByRole: grant.grantedByRole, createdAt: grant.createdAt.toISOString() })),
  };
}

const conversationInclude = {
  messages: { orderBy: { createdAt: "asc" as const } },
  sharedResources: { orderBy: { createdAt: "asc" as const } },
  assetGrants: { orderBy: { createdAt: "asc" as const } },
};

export async function listConversations(principal: CurrentPrincipal) {
  const ownerId = owner(principal);
  const records = await getPrisma().livingBookConversation.findMany({
    where: { OR: [{ requesterOwnerId: ownerId }, { targetOwnerId: ownerId }] },
    include: conversationInclude,
    orderBy: { updatedAt: "desc" },
  });
  return records.map((record) => toConversationDto(record, ownerId));
}

/** Creating a request does not grant a chat channel. An enrolled Living Book
 * must later accept it through its owner workspace before messages are allowed. */
export async function createConversationRequest(principal: CurrentPrincipal, livingBookId: string, openingMessage: string) {
  const targetProfile = await findDiscoverableLivingProfile(livingBookId);
  if (!targetProfile && !canRequestAsyncConversation(livingBookId)) {
    throw new LivingBookConversationError("FORBIDDEN", "This Living Book is not accepting asynchronous questions");
  }
  const body = openingMessage.trim();
  if (!body || body.length > 4_000) throw new LivingBookConversationError("BAD_REQUEST", "Opening message must contain 1 to 4000 characters");
  const isAiLibrarian = livingBookId === AI_LIVING_BOOK_ID;
  const record = await getPrisma().livingBookConversation.create({
    data: {
      requesterOwnerId: owner(principal),
      targetOwnerId: targetProfile?.ownerId ?? null,
      livingBookId,
      status: isAiLibrarian ? "accepted" : "pending",
      messages: { create: isAiLibrarian ? [{ senderRole: "requester", body }, { senderRole: "living_book", body: aiReply(body) }] : { senderRole: "requester", body } },
    },
    include: conversationInclude,
  });
  return toConversationDto(record, owner(principal));
}

async function participantConversation(principal: CurrentPrincipal, conversationId: string) {
  const ownerId = owner(principal);
  const record = await getPrisma().livingBookConversation.findFirst({
    where: { id: conversationId, OR: [{ requesterOwnerId: ownerId }, { targetOwnerId: ownerId }] },
    include: conversationInclude,
  });
  if (!record) throw new LivingBookConversationError("NOT_FOUND", "Conversation not found");
  return record;
}

export async function sendConversationMessage(principal: CurrentPrincipal, conversationId: string, body: string) {
  const conversation = await participantConversation(principal, conversationId);
  if (conversation.status !== "accepted") {
    throw new LivingBookConversationError("CONFLICT", "Messages are available after the Living Book accepts the request");
  }
  const message = body.trim();
  if (!message || message.length > 8_000) throw new LivingBookConversationError("BAD_REQUEST", "Message must contain 1 to 8000 characters");
  const senderRole = conversation.requesterOwnerId === owner(principal) ? "requester" : "living_book";
  await getPrisma().livingBookMessage.create({ data: { conversationId, senderRole, body: message } });
  if (conversation.livingBookId === AI_LIVING_BOOK_ID && senderRole === "requester") {
    await getPrisma().livingBookMessage.create({ data: { conversationId, senderRole: "living_book", body: aiReply(message) } });
  }
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await participantConversation(principal, conversationId), owner(principal));
}

export async function shareConversationResource(principal: CurrentPrincipal, conversationId: string, input: { title: string; url: string; sourceLabel?: string }) {
  const conversation = await participantConversation(principal, conversationId);
  if (conversation.status !== "accepted") throw new LivingBookConversationError("CONFLICT", "Resources can be shared after the request is accepted");
  const url = normalizeSharedUrl(input.url);
  const title = input.title.trim();
  if (!url || !title || title.length > 300 || (input.sourceLabel?.length ?? 0) > 120) {
    throw new LivingBookConversationError("BAD_REQUEST", "A title and an HTTP(S) source URL are required");
  }
  await getPrisma().livingBookSharedResource.create({
    data: { conversationId, sharedByRole: conversation.requesterOwnerId === owner(principal) ? "requester" : "living_book", title, url, sourceLabel: input.sourceLabel?.trim() || null },
  });
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await participantConversation(principal, conversationId), owner(principal));
}

export async function respondToConversation(principal: CurrentPrincipal, conversationId: string, decision: "accept" | "decline") {
  const ownerId = owner(principal);
  const conversation = await getPrisma().livingBookConversation.findFirst({ where: { id: conversationId, targetOwnerId: ownerId }, include: conversationInclude });
  if (!conversation) throw new LivingBookConversationError("NOT_FOUND", "找不到待处理的交流请求");
  if (conversation.status !== "pending") throw new LivingBookConversationError("CONFLICT", "这条交流请求已经处理过了");
  const updated = await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { status: decision === "accept" ? "accepted" : "declined", updatedAt: new Date() }, include: conversationInclude });
  return toConversationDto(updated, ownerId);
}

export async function shareConversationAsset(principal: CurrentPrincipal, conversationId: string, assetId: string) {
  const conversation = await participantConversation(principal, conversationId);
  if (conversation.status !== "accepted") throw new LivingBookConversationError("CONFLICT", "Assets can be shared after the request is accepted");
  const asset = await getPrisma().knowledgeAsset.findFirst({ where: { id: assetId, ownerId: owner(principal), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (!asset) throw new LivingBookConversationError("NOT_FOUND", "找不到可分享的私有资料");
  await getPrisma().livingBookAssetGrant.upsert({ where: { conversationId_assetReference: { conversationId, assetReference: assetId } }, create: { id: crypto.randomUUID(), conversationId, assetReference: assetId, grantedByRole: conversation.requesterOwnerId === owner(principal) ? "requester" : "living_book" }, update: { revokedAt: null } });
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await participantConversation(principal, conversationId), owner(principal));
}

export async function revokeConversationAsset(principal: CurrentPrincipal, conversationId: string, assetId: string) {
  const conversation = await participantConversation(principal, conversationId);
  if (conversation.status !== "accepted") throw new LivingBookConversationError("CONFLICT", "Assets can be revoked after the request is accepted");
  const role = conversation.requesterOwnerId === owner(principal) ? "requester" : "living_book";
  const grant = conversation.assetGrants.find((item) => item.assetReference === assetId && item.grantedByRole === role && !item.revokedAt);
  if (!grant) throw new LivingBookConversationError("NOT_FOUND", "找不到你分享的有效资料授权");
  await getPrisma().livingBookAssetGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await participantConversation(principal, conversationId), owner(principal));
}

export async function readConversationAsset(principal: CurrentPrincipal, conversationId: string, assetId: string) {
  const conversation = await participantConversation(principal, conversationId);
  if (conversation.status !== "accepted") throw new LivingBookConversationError("CONFLICT", "Assets are available after the request is accepted");
  const grant = conversation.assetGrants.find((item) => item.assetReference === assetId && !item.revokedAt);
  if (!grant) throw new LivingBookConversationError("FORBIDDEN", "这份资料尚未分享给当前会话，或授权已撤销");
  const asset = await getPrisma().knowledgeAsset.findFirst({ where: { id: assetId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (!asset) throw new LivingBookConversationError("NOT_FOUND", "共享资料已删除或已过期");
  try {
    return { originalName: asset.originalName, mimeType: asset.mimeType || "application/octet-stream", bytes: await readFile(asset.storagePath) };
  } catch {
    throw new LivingBookConversationError("NOT_FOUND", "共享资料文件当前不可读取");
  }
}
