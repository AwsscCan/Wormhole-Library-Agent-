import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!g.__prisma) g.__prisma = new PrismaClient();
  return g.__prisma;
}
