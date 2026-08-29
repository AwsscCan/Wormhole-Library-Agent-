import { NextResponse } from "next/server";
import { z } from "zod";
import { guestCookieHeader } from "@/lib/auth/principal";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { createCatalogSource, CatalogSourceError, listCatalogSources } from "@/lib/catalog/sourceRepository";

const schema = z.object({ name: z.string().min(1).max(120), protocol: z.enum(["sru", "oai_pmh", "z3950", "rest", "import"]), endpoint: z.string().min(1).max(2_000), scope: z.enum(["personal", "institution"]).optional(), username: z.string().max(200).optional(), password: z.string().max(500).optional(), mapping: z.record(z.string()).optional() }).strict();
function response(body: unknown, status: number, request: Request, principal: CurrentPrincipal) { const result = NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); if (principal.mode === "guest") { const cookie = guestCookieHeader(principal, request); if (cookie) result.headers.append("Set-Cookie", cookie); } return result; }
export async function GET(request: Request) { const resolved = await requirePrincipal(request); if (!("principal" in resolved)) return resolved.response; return response(await listCatalogSources(resolved.principal), 200, request, resolved.principal); }
export async function POST(request: Request) { const resolved = await requirePrincipal(request); if (!("principal" in resolved)) return resolved.response; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return response({ error: { code: "BAD_REQUEST", message: "请检查馆藏来源字段。" } }, 400, request, resolved.principal); try { return response(await createCatalogSource(resolved.principal, parsed.data), 201, request, resolved.principal); } catch (error) { const status = error instanceof CatalogSourceError ? error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400 : 500; return response({ error: { code: error instanceof CatalogSourceError ? error.code : "INTERNAL_ERROR", message: error instanceof CatalogSourceError ? error.message : "无法保存馆藏来源。" } }, status, request, resolved.principal); } }
