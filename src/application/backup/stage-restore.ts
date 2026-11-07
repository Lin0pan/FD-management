import { compareMigrationHistories } from "@/domain/backup/backup";
import {
  BackupDamaged,
  BackupFromNewerVersion,
  BackupIncompatible,
  BackupNotADatabase,
} from "@/domain/errors";
import type { AuditLog, Clock, DatabaseBackups, ProcessControl } from "../ports";

export interface StagedRestore {
  readonly migrationsApplied: number;
  /** The start that is ending — the browser waits for a different one. */
  readonly restartingFrom: string;
  /** `false` when nothing will start the software again by itself. */
  readonly supervised: boolean;
}

export interface StageRestoreDeps {
  readonly backups: DatabaseBackups;
  readonly clock: Clock;
  readonly audit: AuditLog;
  readonly process: ProcessControl;
}

/**
 * Check a backup, bring it up to this version and stage it for the next start, then restart the
 * software. The register itself is not touched here: it is swapped at the next start, so nothing
 * written between now and then could be lost by a live swap.
 *
 * @throws {BackupNotADatabase} if the file is not SQLite or has no migration history.
 * @throws {BackupDamaged} if it fails the integrity check or a migration in it never finished.
 * @throws {BackupFromNewerVersion} if it carries migrations this software does not know.
 * @throws {BackupIncompatible} if its migration history parted from this software's.
 * @throws {BackupMigrationFailed} if bringing an older backup up failed.
 */
export async function stageRestore(
  deps: StageRestoreDeps,
  content: Uint8Array,
): Promise<StagedRestore> {
  await deps.backups.receiveCandidate(content);
  let migrationsApplied: number;
  try {
    migrationsApplied = await checkAndMigrate(deps.backups);
  } catch (error: unknown) {
    await deps.backups.discardCandidate();
    throw error;
  }
  await deps.backups.stageCandidate();

  await deps.audit.append({
    what: "backup.restoreStaged",
    changedFields: [],
    when: deps.clock.now(),
    why: `migrationsApplied=${migrationsApplied}`,
  });
  deps.process.restartSoon();
  return {
    migrationsApplied,
    restartingFrom: deps.process.bootId,
    supervised: deps.process.supervised,
  };
}

async function checkAndMigrate(backups: DatabaseBackups): Promise<number> {
  const inspection = await backups.inspectCandidate();
  if (inspection === null) {
    throw new BackupNotADatabase();
  }
  if (!inspection.intact) {
    throw new BackupDamaged();
  }
  const comparison = compareMigrationHistories(
    inspection.migrations,
    await backups.softwareMigrations(),
  );
  switch (comparison.kind) {
    case "FOREIGN":
      throw new BackupNotADatabase();
    case "AHEAD":
      throw new BackupFromNewerVersion();
    case "DIVERGED":
      throw new BackupIncompatible();
    case "BEHIND":
      await backups.migrateCandidate();
      return comparison.missing.length;
    case "CURRENT":
      return 0;
  }
}
