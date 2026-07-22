import { PrismaClient } from "@prisma/client";

/**
 * The process-wide Prisma client.
 *
 * Next.js re-evaluates modules on every hot reload in development, which would otherwise open a new
 * connection pool per edit until SQLite refuses. Caching the client on `globalThis` is the standard
 * remedy; in production the module is evaluated once and the branch never matters.
 *
 * Tests construct their own client against a throwaway database file instead of using this one.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  fdPrismaClient?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.fdPrismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.fdPrismaClient = prisma;
}
