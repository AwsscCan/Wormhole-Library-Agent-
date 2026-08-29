export type OpenLibrarySubjectWork = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  url: string;
  subjects: string[];
};

export type OpenLibrarySubjectResult = {
  subject: string;
  label: string;
  workCount: number;
  branches: Array<{ id: string; label: string; count: number }>;
  works: OpenLibrarySubjectWork[];
};

export const OPEN_LIBRARY_ROOT_SUBJECTS = [
  { id: "science", label: "科学" },
  { id: "computer_science", label: "计算机科学" },
  { id: "artificial_intelligence", label: "人工智能" },
  { id: "mathematics", label: "数学" },
  { id: "social_sciences", label: "社会科学" },
  { id: "history", label: "历史" },
  { id: "philosophy", label: "哲学" },
  { id: "psychology", label: "心理学" },
  { id: "literature", label: "文学" },
  { id: "business", label: "商业" },
  { id: "education", label: "教育" },
  { id: "medicine", label: "医学" },
] as const;

export function openLibrarySubjectId(label: string) {
  return label.normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

export function projectOpenLibrarySubject(subject: string, payload: unknown): OpenLibrarySubjectResult {
  const value = payload as { name?: unknown; work_count?: unknown; works?: Array<Record<string, unknown>> };
  const works = (Array.isArray(value.works) ? value.works : []).map((work): OpenLibrarySubjectWork | null => {
    const key = typeof work.key === "string" ? work.key : "";
    const title = typeof work.title === "string" ? work.title.trim() : "";
    if (!key || !title) return null;
    const authors = Array.isArray(work.authors) ? work.authors.map((author) => typeof author === "object" && author && "name" in author ? String(author.name) : "").filter(Boolean) : [];
    const subjects = Array.isArray(work.subject) ? work.subject.map(String).filter(Boolean).slice(0, 20) : [];
    const year = Number(work.first_publish_year);
    return { id: key.replace(/^\/works\//, ""), title, authors, ...(Number.isFinite(year) ? { year } : {}), url: `https://openlibrary.org${key}`, subjects };
  }).filter((work): work is OpenLibrarySubjectWork => work !== null);

  const frequencies = new Map<string, number>();
  for (const work of works) {
    for (const label of work.subjects) {
      const id = openLibrarySubjectId(label);
      if (!id || id === subject || label.length > 48) continue;
      frequencies.set(label, (frequencies.get(label) ?? 0) + 1);
    }
  }
  const branches = [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([label, count]) => ({ id: openLibrarySubjectId(label), label, count }));

  return {
    subject,
    label: typeof value.name === "string" && value.name.trim() ? value.name : subject.replace(/_/g, " "),
    workCount: Number.isFinite(Number(value.work_count)) ? Number(value.work_count) : works.length,
    branches,
    works,
  };
}

export function projectOpenLibrarySearchSubject(subject: string, payload: unknown): OpenLibrarySubjectResult {
  const value = payload as { numFound?: unknown; docs?: Array<Record<string, unknown>> };
  const works = (Array.isArray(value.docs) ? value.docs : []).map((doc) => ({
    key: doc.key,
    title: doc.title,
    authors: Array.isArray(doc.author_name) ? doc.author_name.map((name) => ({ name })) : [],
    first_publish_year: doc.first_publish_year,
    subject: doc.subject,
  }));
  return projectOpenLibrarySubject(subject, {
    name: subject.replace(/_/g, " "),
    work_count: value.numFound,
    works,
  });
}
