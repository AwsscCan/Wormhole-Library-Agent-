import "server-only";
import { getPrisma } from "@/lib/db/prisma";
import { principalOwnerKey } from "@/lib/research/principal";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import livingBooksSeed from "@/data/seed-living-books.json";
import { AI_LIVING_BOOK_ID } from "@/lib/livingLibrary/constants";

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
  id: string; livingBookId: string; status: string; createdAt: Date; updatedAt: Date;
  messages: { id: string; senderRole: string; body: string; createdAt: Date }[];
  sharedResources: { id: string; sharedByRole: string; title: string; url: string; sourceLabel: string | null; createdAt: Date }[];
}) {
  return {
    id: record.id,
    livingBookId: record.livingBookId,
    status: record.status as ConversationStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    messages: record.messages.map((message) => ({ ...message, senderRole: message.senderRole as SenderRole, createdAt: message.createdAt.toISOString() })),
    sharedResources: record.sharedResources.map((resource) => ({ ...resource, sourceLabel: resource.sourceLabel ?? undefined, createdAt: resource.createdAt.toISOString() })),
  };
}

const conversationInclude = {
  messages: { orderBy: { createdAt: "asc" as const } },
  sharedResources: { orderBy: { createdAt: "asc" as const } },
};

export async function listConversations(principal: CurrentPrincipal) {
  const records = await getPrisma().livingBookConversation.findMany({
    where: { requesterOwnerId: owner(principal) },
    include: conversationInclude,
    orderBy: { updatedAt: "desc" },
  });
  return records.map(toConversationDto);
}

/** Creating a request does not grant a chat channel. An enrolled Living Book
 * must later accept it through its owner workspace before messages are allowed. */
export async function createConversationRequest(principal: CurrentPrincipal, livingBookId: string, openingMessage: string) {
  if (!canRequestAsyncConversation(livingBookId)) {
    throw new LivingBookConversationError("FORBIDDEN", "This Living Book is not accepting asynchronous questions");
  }
  const body = openingMessage.trim();
  if (!body || body.length > 4_000) throw new LivingBookConversationError("BAD_REQUEST", "Opening message must contain 1 to 4000 characters");
  const isAiLibrarian = livingBookId === AI_LIVING_BOOK_ID;
  const record = await getPrisma().livingBookConversation.create({
    data: {
      requesterOwnerId: owner(principal),
      livingBookId,
      status: isAiLibrarian ? "accepted" : "pending",
      messages: { create: isAiLibrarian ? [{ senderRole: "requester", body }, { senderRole: "living_book", body: aiReply(body) }] : { senderRole: "requester", body } },
    },
    include: conversationInclude,
  });
  return toConversationDto(record);
}

async function ownedConversation(principal: CurrentPrincipal, conversationId: string) {
  const record = await getPrisma().livingBookConversation.findFirst({
    where: { id: conversationId, requesterOwnerId: owner(principal) },
    include: conversationInclude,
  });
  if (!record) throw new LivingBookConversationError("NOT_FOUND", "Conversation not found");
  return record;
}

export async function sendConversationMessage(principal: CurrentPrincipal, conversationId: string, body: string) {
  const conversation = await ownedConversation(principal, conversationId);
  if (conversation.status !== "accepted") {
    throw new LivingBookConversationError("CONFLICT", "Messages are available after the Living Book accepts the request");
  }
  const message = body.trim();
  if (!message || message.length > 8_000) throw new LivingBookConversationError("BAD_REQUEST", "Message must contain 1 to 8000 characters");
  await getPrisma().livingBookMessage.create({ data: { conversationId, senderRole: "requester", body: message } });
  if (conversation.livingBookId === AI_LIVING_BOOK_ID) {
    await getPrisma().livingBookMessage.create({ data: { conversationId, senderRole: "living_book", body: aiReply(message) } });
  }
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await ownedConversation(principal, conversationId));
}

export async function shareConversationResource(principal: CurrentPrincipal, conversationId: string, input: { title: string; url: string; sourceLabel?: string }) {
  const conversation = await ownedConversation(principal, conversationId);
  if (conversation.status !== "accepted") throw new LivingBookConversationError("CONFLICT", "Resources can be shared after the request is accepted");
  const url = normalizeSharedUrl(input.url);
  const title = input.title.trim();
  if (!url || !title || title.length > 300 || (input.sourceLabel?.length ?? 0) > 120) {
    throw new LivingBookConversationError("BAD_REQUEST", "A title and an HTTP(S) source URL are required");
  }
  await getPrisma().livingBookSharedResource.create({
    data: { conversationId, sharedByRole: "requester", title, url, sourceLabel: input.sourceLabel?.trim() || null },
  });
  await getPrisma().livingBookConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return toConversationDto(await ownedConversation(principal, conversationId));
}
