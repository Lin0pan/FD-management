import type { DatabaseBackups } from "../ports";

export interface ReadLastBackupDeps {
  readonly backups: DatabaseBackups;
}

/** When DF last took a backup, or `null` if they never have. */
export async function readLastBackup(deps: ReadLastBackupDeps): Promise<Date | null> {
  return deps.backups.lastCreatedAt();
}
