import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { getPrisma } from "@/lib/db/prisma";
import { principalOwnerKey } from "@/lib/research/principal";
import { encryptProviderSecret } from "@/lib/llm/secretBox";

export type CatalogProtocol = "sru" | "oai_pmh" | "z3950" | "rest" | "import";
export type CatalogSourceDto = { id: string; name: string; scope: "personal" | "institution"; protocol: CatalogProtocol; endpoint: string; status: string; lastCheckedAt?: string; lastMessage?: string; hasCredentials: boolean; mapping: Record<string, string> };
export type CatalogSourceInput = { name: string; protocol: CatalogProtocol; endpoint: string; scope?: "personal" | "institution"; username?: string; password?: string; mapping?: Record<string, string> };

export class CatalogSourceError extends Error { constructor(public readonly code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND", message: string) { super(message); } }

function owner(principal: CurrentPrincipal) { return principalOwnerKey(principal); }
function validateEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return url.toString();
  } catch { /* handled below */ }
  throw new CatalogSourceError("BAD_REQUEST", "馆藏地址必须是 HTTPS；本机测试只允许 localhost。");
}
function parseMapping(value: string) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {}; } catch { return {}; } }
function dto(row: { id: string; name: string; scope: string; protocol: string; endpoint: string; mappingJson: string; encryptedCredentials: string | null; status: string; lastCheckedAt: Date | null; lastMessage: string | null }): CatalogSourceDto { return { id: row.id, name: row.name, scope: row.scope === "institution" ? "institution" : "personal", protocol: row.protocol as CatalogProtocol, endpoint: row.endpoint, status: row.status, ...(row.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt.toISOString() } : {}), ...(row.lastMessage ? { lastMessage: row.lastMessage } : {}), hasCredentials: Boolean(row.encryptedCredentials), mapping: parseMapping(row.mappingJson) }; }

const columns = Prisma.sql`"id", "name", "scope", "protocol", "endpoint", "mappingJson", "encryptedCredentials", "status", "lastCheckedAt", "lastMessage"`;

export async function listCatalogSources(principal: CurrentPrincipal) {
  const rows = await getPrisma().$queryRaw<Array<Parameters<typeof dto>[0]>>(Prisma.sql`SELECT ${columns} FROM "CatalogSource" WHERE "ownerId" = ${owner(principal)} ORDER BY "updatedAt" DESC`);
  return rows.map(dto);
}

export async function createCatalogSource(principal: CurrentPrincipal, input: CatalogSourceInput) {
  if (input.scope === "institution") throw new CatalogSourceError("FORBIDDEN", "普通用户只能保存个人馆藏来源；高校共享来源需由管理员发布。");
  const name = input.name.trim();
  if (!name || name.length > 120 || !input.protocol) throw new CatalogSourceError("BAD_REQUEST", "请填写来源名称和连接协议。");
  const endpoint = validateEndpoint(input.endpoint);
  const id = randomUUID(); const createdAt = new Date();
  const credentials = input.username || input.password ? encryptProviderSecret(JSON.stringify({ username: input.username ?? "", password: input.password ?? "" })) : null;
  await getPrisma().$executeRaw(Prisma.sql`INSERT INTO "CatalogSource" ("id", "ownerId", "name", "scope", "protocol", "endpoint", "mappingJson", "encryptedCredentials", "status", "createdAt", "updatedAt") VALUES (${id}, ${owner(principal)}, ${name}, 'personal', ${input.protocol}, ${endpoint}, ${JSON.stringify(input.mapping ?? {})}, ${credentials}, 'configured', ${createdAt}, ${createdAt})`);
  const rows = await getPrisma().$queryRaw<Array<Parameters<typeof dto>[0]>>(Prisma.sql`SELECT ${columns} FROM "CatalogSource" WHERE "id" = ${id} AND "ownerId" = ${owner(principal)} LIMIT 1`);
  return dto(rows[0]);
}

export async function deleteCatalogSource(principal: CurrentPrincipal, id: string) {
  const changed = await getPrisma().$executeRaw(Prisma.sql`DELETE FROM "CatalogSource" WHERE "id" = ${id} AND "ownerId" = ${owner(principal)}`);
  if (!changed) throw new CatalogSourceError("NOT_FOUND", "找不到这条馆藏来源。");
}

export async function testCatalogSource(principal: CurrentPrincipal, id: string) {
  const rows = await getPrisma().$queryRaw<Array<Parameters<typeof dto>[0] & { ownerId?: string; lastCheckedAt?: Date }>>(Prisma.sql`SELECT ${columns}, "ownerId" FROM "CatalogSource" WHERE "id" = ${id} AND "ownerId" = ${owner(principal)} LIMIT 1`);
  const source = rows[0]; if (!source) throw new CatalogSourceError("NOT_FOUND", "找不到这条馆藏来源。");
  const url = new URL(source.endpoint); if (source.protocol === "oai_pmh") url.searchParams.set("verb", "Identify"); if (source.protocol === "sru" || source.protocol === "rest") url.searchParams.set("q", "library");
  let status = "failed"; let message = "连接失败，请检查地址、校园网或 SSO 访问权限。";
  try { const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json, application/xml, text/xml, text/plain" } }); status = response.ok ? "live" : response.status === 401 || response.status === 403 ? "requires_access" : "failed"; message = response.ok ? "来源可访问；请根据返回格式继续配置字段映射。" : status === "requires_access" ? "来源需要登录、校园网或机构许可。" : `来源返回 HTTP ${response.status}。`; } catch { /* normalized below */ }
  const checked = new Date(); await getPrisma().$executeRaw(Prisma.sql`UPDATE "CatalogSource" SET "status" = ${status}, "lastCheckedAt" = ${checked}, "lastMessage" = ${message}, "updatedAt" = ${checked} WHERE "id" = ${id} AND "ownerId" = ${owner(principal)}`);
  return { ...dto({ ...source, status, lastCheckedAt: checked, lastMessage: message }), preview: { protocol: source.protocol, resultCount: status === "live" ? "可访问，等待检索" : 0, fields: source.protocol === "import" ? ["title", "author", "year", "url", "subject"] : ["title", "author", "year", "identifier", "availability"] } };
}
