import { NextResponse } from "next/server";
import { openLibrarySubjectId, projectOpenLibrarySearchSubject, projectOpenLibrarySubject } from "@/lib/catalog/openLibrarySubjects";

export async function GET(request: Request) {
  const subject = openLibrarySubjectId(new URL(request.url).searchParams.get("subject") ?? "");
  if (!subject) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "请选择 Open Library 分类。" } }, { status: 400 });
  try {
    const response = await fetch(`https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=36&details=true`, {
      headers: { Accept: "application/json", "User-Agent": "Wormhole-Library-Agent/0.1" },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
    let result = projectOpenLibrarySubject(subject, await response.json());
    if (!result.works.length) {
      const fallback = await fetch(`https://openlibrary.org/search.json?subject=${encodeURIComponent(subject)}&limit=36&fields=key,title,author_name,first_publish_year,subject`, {
        headers: { Accept: "application/json", "User-Agent": "Wormhole-Library-Agent/0.1" },
        signal: AbortSignal.timeout(12_000),
        next: { revalidate: 900 },
      });
      if (fallback.ok) result = projectOpenLibrarySearchSubject(subject, await fallback.json());
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: { code: "SOURCE_FAILURE", message: "Open Library 分类暂时不可访问，请稍后重试。" } }, { status: 502 });
  }
}
