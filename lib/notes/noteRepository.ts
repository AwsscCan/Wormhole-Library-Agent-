import { getPrisma } from "@/lib/db/prisma";

export type NoteLink = {
  kind: "session" | "resource" | "graph_node" | "draft_section";
  targetId: string;
};

export type Note = {
  id: string;
  ownerId: string;
  title: string;
  markdown: string;
  links: NoteLink[];
  version: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateNoteInput = Pick<Note, "title" | "markdown" | "links">;
export type UpdateNotePatch = Partial<CreateNoteInput>;

export class NoteRepositoryError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT") {
    super(code === "NOT_FOUND" ? "Note not found" : "Note version conflict");
    this.name = "NoteRepositoryError";
  }
}

function serializeNote(note: {
  id: string;
  ownerId: string;
  title: string;
  markdown: string;
  linksJson: string;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Note {
  return {
    id: note.id,
    ownerId: note.ownerId,
    title: note.title,
    markdown: note.markdown,
    links: JSON.parse(note.linksJson) as NoteLink[],
    version: note.version,
    ...(note.deletedAt ? { deletedAt: note.deletedAt.toISOString() } : {}),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function createNote(ownerId: string, input: CreateNoteInput): Promise<Note> {
  const note = await getPrisma().note.create({
    data: {
      ownerId,
      title: input.title,
      markdown: input.markdown,
      linksJson: JSON.stringify(input.links),
    },
  });
  return serializeNote(note);
}

export async function listNotes(ownerId: string): Promise<Note[]> {
  const notes = await getPrisma().note.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  return notes.map(serializeNote);
}

export async function updateNote(
  ownerId: string,
  noteId: string,
  expectedVersion: number,
  patch: UpdateNotePatch,
): Promise<Note> {
  const prisma = getPrisma();
  const existing = await prisma.note.findFirst({ where: { id: noteId, ownerId, deletedAt: null } });
  if (!existing) throw new NoteRepositoryError("NOT_FOUND");

  const update = await prisma.note.updateMany({
    where: { id: noteId, ownerId, deletedAt: null, version: expectedVersion },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.markdown !== undefined ? { markdown: patch.markdown } : {}),
      ...(patch.links !== undefined ? { linksJson: JSON.stringify(patch.links) } : {}),
      version: { increment: 1 },
    },
  });
  if (update.count !== 1) throw new NoteRepositoryError("CONFLICT");

  const note = await prisma.note.findFirst({ where: { id: noteId, ownerId, deletedAt: null } });
  if (!note) throw new NoteRepositoryError("NOT_FOUND");
  return serializeNote(note);
}

export async function softDeleteNote(ownerId: string, noteId: string): Promise<void> {
  const deleted = await getPrisma().note.updateMany({
    where: { id: noteId, ownerId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (deleted.count !== 1) throw new NoteRepositoryError("NOT_FOUND");
}
