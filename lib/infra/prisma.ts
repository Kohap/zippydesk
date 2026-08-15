import { PrismaClient } from "@prisma/client";

const GLOBAL_KEY = "__zippydesk_prisma__";

export function getPrisma(): PrismaClient {
  const g = globalThis as Record<string, unknown>;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY] as PrismaClient;
  const prisma = new PrismaClient();
  g[GLOBAL_KEY] = prisma;
  return prisma;
}
