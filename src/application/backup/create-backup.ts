import { backupFileName } from "@/domain/backup/backup";
import type { AuditLog, Clock, DatabaseBackups } from "../ports";

export interface CreateBackupDeps {
  readonly backups: DatabaseBackups;
  readonly clock: Clock;
  readonly audit: AuditLog;
  readonly softwareVersion: string;
}

export interface Backup {
  readonly fileName: string;
  readonly content: Uint8Array;
}

/**
 * Copy the register out for DF to keep. Recorded after the copy is taken, so the entry only exists
 * for a backup that does — and it is what „Letzte Sicherung" reads.
 */
export async function createBackup(deps: CreateBackupDeps): Promise<Backup> {
  const content = await deps.backups.snapshot();
  const when = deps.clock.now();
  const fileName = backupFileName(when, deps.softwareVersion);
  await deps.audit.append({
    what: "backup.created",
    changedFields: [],
    when,
    why: `file=${fileName}`,
  });
  return { fileName, content };
}
