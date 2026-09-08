import { PrismaClient } from "@prisma/client";

/**
 * The process-wide Prisma client, cached on `globalThis` because Next.js re-evaluates modules on
 * every hot reload and would otherwise open a connection pool per edit until SQLite refuses. In
 * production the module is evaluated once and the branch never matters.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  fdPrismaClient?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.fdPrismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.fdPrismaClient = prisma;
}
