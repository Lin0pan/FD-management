import type { DatabaseBackups, ProcessControl } from "../ports";

export interface ReadRestoreStatusDeps {
  readonly backups: DatabaseBackups;
  readonly process: ProcessControl;
}

export interface RestoreStatus {
  readonly bootId: string;
  /** Still `true` after a restart means the start-up swap failed and the old register is in use. */
  readonly staged: boolean;
}

/** What the browser polls while the software restarts after a restore has been staged. */
export async function readRestoreStatus(deps: ReadRestoreStatusDeps): Promise<RestoreStatus> {
  return { bootId: deps.process.bootId, staged: await deps.backups.hasStagedRestore() };
}
