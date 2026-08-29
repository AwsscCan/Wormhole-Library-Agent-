import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "development") {
    process.env.DATABASE_URL = "file:./dev.db";
  }
  if (!g.__prisma) g.__prisma = new PrismaClient();
  return g.__prisma;
}
