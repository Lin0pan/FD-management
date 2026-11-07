import { safetyCopyFileName } from "@/domain/backup/backup";
import type { AuditLog, Clock, DatabaseBackups } from "../ports";

export interface ApplyStagedRestoreDeps {
  readonly backups: DatabaseBackups;
  readonly clock: Clock;
  readonly audit: AuditLog;
  readonly softwareVersion: string;
}

/**
 * Swap a staged restore in at start-up, before anything has opened the register. The register it
 * replaces is copied aside first and never deleted: it is the one way back from a wrong file.
 *
 * The audit entry goes into the register swapped in — the old register's last word, that a restore
 * was staged, survives in the safety copy.
 */
export async function applyStagedRestore(
  deps: ApplyStagedRestoreDeps,
): Promise<{ readonly safetyCopy: string } | null> {
  if (!(await deps.backups.hasStagedRestore())) {
    return null;
  }
  const when = deps.clock.now();
  const safetyCopy = safetyCopyFileName(when, deps.softwareVersion);
  await deps.backups.preserveCurrent(safetyCopy);
  await deps.backups.swapInStaged();
  await deps.audit.append({
    what: "backup.restored",
    changedFields: [],
    when,
    why: `safetyCopy=${safetyCopy}`,
  });
  return { safetyCopy };
}
