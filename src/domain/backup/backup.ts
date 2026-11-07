/**
 * The rules of backing up and restoring the register: which backup this software may restore, and
 * what a backup file is called. Copying the file itself is infrastructure's.
 */

/** One applied migration, as Prisma records it in `_prisma_migrations`. */
export interface MigrationRecord {
  readonly name: string;
  /** SHA-256 of the migration's SQL — a migration edited after the fact keeps its name. */
  readonly checksum: string;
}

/**
 * How a backup's schema stands to this software's.
 *
 * Only `CURRENT` and `BEHIND` may be restored. `AHEAD` and `DIVERGED` would leave a database the
 * software does not understand, and migrations only run forwards.
 */
export type MigrationComparison =
  | { readonly kind: "CURRENT" }
  | { readonly kind: "BEHIND"; readonly missing: ReadonlyArray<string> }
  | { readonly kind: "AHEAD" }
  | { readonly kind: "DIVERGED" }
  | { readonly kind: "FOREIGN" };

function keys(records: ReadonlyArray<MigrationRecord>): string[] {
  return records.map((record) => `${record.name}#${record.checksum}`).sort();
}

/**
 * Compare the migrations a backup carries with the ones this software ships. The version in the file
 * name is never consulted: a file can be renamed, its history cannot.
 */
export function compareMigrationHistories(
  backup: ReadonlyArray<MigrationRecord>,
  software: ReadonlyArray<MigrationRecord>,
): MigrationComparison {
  if (backup.length === 0) {
    return { kind: "FOREIGN" };
  }
  // The names lead with a timestamp, so sorting the keys is migration order.
  const theirs = keys(backup);
  const ours = keys(software);

  const shared = Math.min(theirs.length, ours.length);
  if (theirs.slice(0, shared).join("\n") !== ours.slice(0, shared).join("\n")) {
    return { kind: "DIVERGED" };
  }
  if (theirs.length > ours.length) {
    return { kind: "AHEAD" };
  }
  if (theirs.length < ours.length) {
    const missing = [...software].map((record) => record.name).sort();
    return { kind: "BEHIND", missing: missing.slice(theirs.length) };
  }
  return { kind: "CURRENT" };
}

/** Swedish is the locale that writes `2026-11-03 14:05:09`, so the parts are read off by position. */
const BERLIN = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `2026-11-03`, `14-05` and `09` for an instant, read in Berlin. */
function berlinStamp(instant: Date): { day: string; minute: string; second: string } {
  const text = BERLIN.format(instant);
  return {
    day: text.slice(0, 10),
    minute: text.slice(11, 16).replace(":", "-"),
    second: text.slice(17, 19),
  };
}

/** The name a backup DF downloads is given, e.g. `fd-backup_2026-11-03_14-05_v0.5.0.db`. */
export function backupFileName(at: Date, softwareVersion: string): string {
  const s = berlinStamp(at);
  return `fd-backup_${s.day}_${s.minute}_v${softwareVersion}.db`;
}

/**
 * The name of the copy taken automatically before a restore. To the second, because a restore that
 * is staged twice within a minute must not overwrite the first copy.
 */
export function safetyCopyFileName(at: Date, softwareVersion: string): string {
  const s = berlinStamp(at);
  return `fd-before-restore_${s.day}_${s.minute}-${s.second}_v${softwareVersion}.db`;
}
