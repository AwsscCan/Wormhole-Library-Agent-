import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { getPrisma } from "@/lib/db/prisma";
import { principalOwnerKey } from "@/lib/research/principal";
import { forgetSession, recordLearningEvent } from "@/lib/research/memory";

export type AssetRetention = "temporary" | "library";
export type KnowledgeAssetDto = { id: string; originalName: string; mimeType: string; byteSize: number; retention: AssetRetention; expiresAt?: string; extractionStatus: string; createdAt: string };
export type KnowledgeAssetContext = { id: string; originalName: string; extractionStatus: string; extractedText?: string };

const MAX_BYTES = 25 * 1024 * 1024;
const allowedExtensions = new Set([".txt", ".md", ".csv", ".json", ".bib", ".pdf", ".docx"]);

export class KnowledgeAssetError extends Error {
  constructor(public readonly code: "BAD_REQUEST" | "TOO_LARGE" | "NOT_FOUND", message: string) { super(message); }
}

export function retentionExpiry(retention: AssetRetention, createdAt = new Date()): Date | null {
  return retention === "temporary" ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
}

export function validateKnowledgeAsset(name: string, size: number): void {
  if (!name || name.length > 180 || !allowedExtensions.has(path.extname(name).toLowerCase())) {
    throw new KnowledgeAssetError("BAD_REQUEST", "Supported files: TXT, Markdown, CSV, JSON, BibTeX, PDF, and DOCX");
  }
  if (!Number.isFinite(size) || size < 1) throw new KnowledgeAssetError("BAD_REQUEST", "The selected file is empty");
  if (size > MAX_BYTES) throw new KnowledgeAssetError("TOO_LARGE", "Files must be 25 MB or smaller");
}

function storageRoot(ownerId: string) {
  return path.join(process.cwd(), ".data", "knowledge-assets", createHash("sha256").update(ownerId).digest("hex"));
}

function extractText(name: string, bytes: Buffer): { status: string; text?: string } {
  const extension = path.extname(name).toLowerCase();
  if (![".txt", ".md", ".csv", ".json", ".bib"].includes(extension)) return { status: "stored" };
  const text = bytes.toString("utf8").replace(/\0/g, "").slice(0, 150_000);
  return { status: text.trim() ? "extracted" : "stored", ...(text.trim() ? { text } : {}) };
}

function dto(row: { id: string; originalName: string; mimeType: string; byteSize: number; retention: string; expiresAt: Date | string | null; extractionStatus: string; createdAt: Date | string }): KnowledgeAssetDto {
  return { id: row.id, originalName: row.originalName, mimeType: row.mimeType, byteSize: row.byteSize, retention: row.retention as AssetRetention,
    ...(row.expiresAt ? { expiresAt: new Date(row.expiresAt).toISOString() } : {}), extractionStatus: row.extractionStatus, createdAt: new Date(row.createdAt).toISOString() };
}

export async function createKnowledgeAsset(principal: CurrentPrincipal, file: File, retention: AssetRetention): Promise<KnowledgeAssetDto> {
  validateKnowledgeAsset(file.name, file.size);
  const ownerId = principalOwnerKey(principal);
  const id = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  const root = storageRoot(ownerId);
  await mkdir(root, { recursive: true });
  const storagePath = path.join(root, id);
  await writeFile(storagePath, bytes, { flag: "wx" });
  const createdAt = new Date();
  const expiresAt = retentionExpiry(retention, createdAt);
  const extracted = extractText(file.name, bytes);
  try {
    await getPrisma().$executeRaw(Prisma.sql`
      INSERT INTO "KnowledgeAsset" ("id", "ownerId", "originalName", "mimeType", "byteSize", "retention", "expiresAt", "storagePath", "extractionStatus", "extractedText", "createdAt", "updatedAt")
      VALUES (${id}, ${ownerId}, ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${retention}, ${expiresAt}, ${storagePath}, ${extracted.status}, ${extracted.text ?? null}, ${createdAt}, ${createdAt})
    `);
  } catch (error) {
    await rm(storagePath, { force: true });
    throw error;
  }
  if (extracted.text) {
    try {
      await recordLearningEvent({ ownerId, sessionId: `asset:${id}`, kind: "note", resourceId: id,
        conceptId: path.basename(file.name, path.extname(file.name)).toLocaleLowerCase(), text: extracted.text });
    } catch (error) {
      console.error("[knowledge-assets] Unable to index extracted text in private memory.", error);
    }
  }
  return dto({ id, originalName: file.name, mimeType: file.type || "application/octet-stream", byteSize: file.size, retention, expiresAt, extractionStatus: extracted.status, createdAt });
}

type AssetRow = { id: string; originalName: string; mimeType: string; byteSize: number; retention: string; expiresAt: Date | null; storagePath: string; extractionStatus: string; createdAt: Date };

export async function listKnowledgeAssets(principal: CurrentPrincipal): Promise<KnowledgeAssetDto[]> {
  const ownerId = principalOwnerKey(principal);
  const now = new Date();
  const expired = await getPrisma().$queryRaw<AssetRow[]>(Prisma.sql`SELECT "id", "storagePath" FROM "KnowledgeAsset" WHERE "ownerId" = ${ownerId} AND "expiresAt" IS NOT NULL AND "expiresAt" <= ${now}`);
  if (expired.length) {
    await Promise.all(expired.map((asset) => rm(asset.storagePath, { force: true })));
    await Promise.all(expired.map((asset) => forgetSession(ownerId, `asset:${asset.id}`)));
    await getPrisma().$executeRaw(Prisma.sql`DELETE FROM "KnowledgeAsset" WHERE "ownerId" = ${ownerId} AND "expiresAt" IS NOT NULL AND "expiresAt" <= ${now}`);
  }
  const rows = await getPrisma().$queryRaw<AssetRow[]>(Prisma.sql`SELECT "id", "originalName", "mimeType", "byteSize", "retention", "expiresAt", "storagePath", "extractionStatus", "createdAt" FROM "KnowledgeAsset" WHERE "ownerId" = ${ownerId} ORDER BY "createdAt" DESC`);
  return rows.map(dto);
}

export async function deleteKnowledgeAsset(principal: CurrentPrincipal, assetId: string): Promise<void> {
  const ownerId = principalOwnerKey(principal);
  const rows = await getPrisma().$queryRaw<AssetRow[]>(Prisma.sql`SELECT "id", "storagePath" FROM "KnowledgeAsset" WHERE "id" = ${assetId} AND "ownerId" = ${ownerId} LIMIT 1`);
  const asset = rows[0];
  if (!asset) throw new KnowledgeAssetError("NOT_FOUND", "Knowledge asset not found");
  await getPrisma().$executeRaw(Prisma.sql`DELETE FROM "KnowledgeAsset" WHERE "id" = ${assetId} AND "ownerId" = ${ownerId}`);
  await rm(asset.storagePath, { force: true });
  try { await forgetSession(ownerId, `asset:${assetId}`); }
  catch (error) { console.error("[knowledge-assets] Unable to forget deleted asset memory.", error); }
}

export async function getKnowledgeAssetContexts(principal: CurrentPrincipal, assetIds: string[]): Promise<KnowledgeAssetContext[]> {
  const uniqueIds = [...new Set(assetIds)].slice(0, 20);
  if (!uniqueIds.length) return [];
  const ownerId = principalOwnerKey(principal);
  const rows = await getPrisma().$queryRaw<Array<{ id: string; originalName: string; extractionStatus: string; extractedText: string | null }>>(Prisma.sql`
    SELECT "id", "originalName", "extractionStatus", "extractedText"
    FROM "KnowledgeAsset" WHERE "ownerId" = ${ownerId} AND "id" IN (${Prisma.join(uniqueIds)})
      AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
    ORDER BY "createdAt" ASC
  `);
  if (rows.length !== uniqueIds.length) throw new Error("One or more selected materials are unavailable");
  return rows.map((row) => ({ id: row.id, originalName: row.originalName, extractionStatus: row.extractionStatus, ...(row.extractedText ? { extractedText: row.extractedText } : {}) }));
}
