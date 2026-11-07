import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { version } from "../../../package.json";
import { FileDatabaseBackups, databaseFileFromUrl } from "./database-backups";

/** The version stamped into a backup's file name — for people only; restores check migrations. */
export const softwareVersion: string = version;

/**
 * The backups of the register `DATABASE_URL` names, with the safety copies in a folder beside it.
 * The project root is the working directory: `npm start` and `next dev` both run from it.
 */
export function databaseBackupsFor(prisma: PrismaClient): FileDatabaseBackups {
  const root = process.cwd();
  const databaseFile = databaseFileFromUrl(process.env.DATABASE_URL ?? "file:../data/fd.db", root);
  return new FileDatabaseBackups({
    prisma,
    databaseFile,
    migrationsDirectory: join(root, "prisma", "migrations"),
    safetyCopyDirectory: join(databaseFile, "..", "sicherheitskopien"),
  });
}
