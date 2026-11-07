import { beforeEach, describe, expect, it } from "vitest";
import type { MigrationRecord } from "@/domain/backup/backup";
import {
  BackupDamaged,
  BackupFromNewerVersion,
  BackupIncompatible,
  BackupMigrationFailed,
  BackupNotADatabase,
} from "@/domain/errors";
import type {
  AuditEntry,
  AuditLog,
  BackupInspection,
  Clock,
  DatabaseBackups,
  ProcessControl,
} from "../ports";
import { applyStagedRestore } from "./apply-staged-restore";
import { createBackup } from "./create-backup";
import { readLastBackup } from "./read-last-backup";
import { readRestoreStatus } from "./read-restore-status";
import { stageRestore } from "./stage-restore";

/** Hand-written fakes only. */

const NOW = new Date("2026-11-03T13:05:09.000Z");
const VERSION = "0.5.0";
const INIT: MigrationRecord = { name: "20261011190927_init", checksum: "a1" };
const SECOND: MigrationRecord = { name: "20261102080000_add_backup", checksum: "b2" };
const REGISTER = new Uint8Array([1, 2, 3]);
const OFFERED = new Uint8Array([4, 5, 6]);

/** The register, the candidate and the staged restore as three slots, the way the adapter has them. */
class FakeDatabaseBackups implements DatabaseBackups {
  register: Uint8Array = REGISTER;
  candidate: Uint8Array | null = null;
  staged: Uint8Array | null = null;
  readonly safetyCopies = new Map<string, Uint8Array>();
  inspection: BackupInspection | null = { intact: true, migrations: [INIT, SECOND] };
  software: ReadonlyArray<MigrationRecord> = [INIT, SECOND];
  migrationFails = false;
  migrated = false;
  last: Date | null = null;

  snapshot(): Promise<Uint8Array> {
    return Promise.resolve(this.register);
  }
  lastCreatedAt(): Promise<Date | null> {
    return Promise.resolve(this.last);
  }
  softwareMigrations(): Promise<ReadonlyArray<MigrationRecord>> {
    return Promise.resolve(this.software);
  }
  receiveCandidate(content: Uint8Array): Promise<void> {
    this.candidate = content;
    return Promise.resolve();
  }
  inspectCandidate(): Promise<BackupInspection | null> {
    return Promise.resolve(this.inspection);
  }
  migrateCandidate(): Promise<void> {
    if (this.migrationFails) {
      return Promise.reject(new BackupMigrationFailed());
    }
    this.migrated = true;
    return Promise.resolve();
  }
  discardCandidate(): Promise<void> {
    this.candidate = null;
    return Promise.resolve();
  }
  stageCandidate(): Promise<void> {
    this.staged = this.candidate;
    this.candidate = null;
    return Promise.resolve();
  }
  hasStagedRestore(): Promise<boolean> {
    return Promise.resolve(this.staged !== null);
  }
  preserveCurrent(fileName: string): Promise<void> {
    this.safetyCopies.set(fileName, this.register);
    return Promise.resolve();
  }
  swapInStaged(): Promise<void> {
    if (this.staged !== null) {
      this.register = this.staged;
      this.staged = null;
    }
    return Promise.resolve();
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];
  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class FakeProcess implements ProcessControl {
  readonly bootId = "boot-1";
  readonly supervised = true;
  restarted = false;
  restartSoon(): void {
    this.restarted = true;
  }
}

const clock: Clock = { now: () => NOW };

let backups: FakeDatabaseBackups;
let audit: FakeAuditLog;
let process: FakeProcess;

beforeEach(() => {
  backups = new FakeDatabaseBackups();
  audit = new FakeAuditLog();
  process = new FakeProcess();
});

function deps() {
  return { backups, audit, clock, process, softwareVersion: VERSION };
}

describe("createBackup", () => {
  it("hands out the register under a name carrying the date and the version", async () => {
    const backup = await createBackup(deps());

    expect(backup.content).toBe(REGISTER);
    expect(backup.fileName).toBe("fd-backup_2026-11-03_14-05_v0.5.0.db");
  });

  it("records the backup, which is what dates the last one", async () => {
    await createBackup(deps());

    expect(audit.entries).toEqual([
      {
        what: "backup.created",
        changedFields: [],
        when: NOW,
        why: "file=fd-backup_2026-11-03_14-05_v0.5.0.db",
      },
    ]);
  });
});

describe("readLastBackup", () => {
  it("is null while no backup was ever taken", async () => {
    expect(await readLastBackup(deps())).toBeNull();
  });

  it("is the instant the last backup was taken", async () => {
    backups.last = NOW;

    expect(await readLastBackup(deps())).toBe(NOW);
  });
});

describe("stageRestore", () => {
  it("stages a backup of the same version and restarts the software", async () => {
    const result = await stageRestore(deps(), OFFERED);

    expect(backups.staged).toBe(OFFERED);
    expect(backups.register).toBe(REGISTER);
    expect(backups.migrated).toBe(false);
    expect(result).toEqual({ migrationsApplied: 0, restartingFrom: "boot-1", supervised: true });
    expect(process.restarted).toBe(true);
  });

  it("brings a backup from an older version up to this one before staging it", async () => {
    backups.inspection = { intact: true, migrations: [INIT] };

    const result = await stageRestore(deps(), OFFERED);

    expect(backups.migrated).toBe(true);
    expect(backups.staged).toBe(OFFERED);
    expect(result.migrationsApplied).toBe(1);
  });

  it("records the staging in the register that is about to be replaced", async () => {
    backups.inspection = { intact: true, migrations: [INIT] };

    await stageRestore(deps(), OFFERED);

    expect(audit.entries).toEqual([
      { what: "backup.restoreStaged", changedFields: [], when: NOW, why: "migrationsApplied=1" },
    ]);
  });

  it.each([
    ["a file that is not SQLite", null, BackupNotADatabase],
    [
      "an SQLite file with no migration history",
      { intact: true, migrations: [] },
      BackupNotADatabase,
    ],
    ["a damaged file", { intact: false, migrations: [INIT, SECOND] }, BackupDamaged],
    [
      "a backup from a newer version",
      {
        intact: true,
        migrations: [INIT, SECOND, { name: "20261203080000_more", checksum: "c3" }],
      },
      BackupFromNewerVersion,
    ],
    [
      "a backup whose history parted from ours",
      { intact: true, migrations: [{ name: INIT.name, checksum: "edited" }] },
      BackupIncompatible,
    ],
  ])("refuses %s and leaves everything as it was", async (_label, inspection, error) => {
    backups.inspection = inspection;

    await expect(stageRestore(deps(), OFFERED)).rejects.toThrow(error);

    expect(backups.candidate).toBeNull();
    expect(backups.staged).toBeNull();
    expect(backups.register).toBe(REGISTER);
    expect(audit.entries).toEqual([]);
    expect(process.restarted).toBe(false);
  });

  it("leaves everything as it was when bringing an older backup up fails", async () => {
    backups.inspection = { intact: true, migrations: [INIT] };
    backups.migrationFails = true;

    await expect(stageRestore(deps(), OFFERED)).rejects.toThrow(BackupMigrationFailed);

    expect(backups.candidate).toBeNull();
    expect(backups.staged).toBeNull();
    expect(process.restarted).toBe(false);
  });
});

describe("applyStagedRestore", () => {
  it("does nothing on a start with no restore staged", async () => {
    expect(await applyStagedRestore(deps())).toBeNull();

    expect(backups.register).toBe(REGISTER);
    expect(backups.safetyCopies.size).toBe(0);
    expect(audit.entries).toEqual([]);
  });

  it("keeps a copy of the register it replaces before swapping the backup in", async () => {
    backups.staged = OFFERED;

    const result = await applyStagedRestore(deps());

    const name = "fd-before-restore_2026-11-03_14-05-09_v0.5.0.db";
    expect(result).toEqual({ safetyCopy: name });
    expect(backups.safetyCopies.get(name)).toBe(REGISTER);
    expect(backups.register).toBe(OFFERED);
  });

  it("records the restore in the register that was swapped in", async () => {
    backups.staged = OFFERED;

    await applyStagedRestore(deps());

    expect(audit.entries).toEqual([
      {
        what: "backup.restored",
        changedFields: [],
        when: NOW,
        why: "safetyCopy=fd-before-restore_2026-11-03_14-05-09_v0.5.0.db",
      },
    ]);
  });
});

describe("readRestoreStatus", () => {
  it("names this start, so the browser sees when the restart has happened", async () => {
    expect(await readRestoreStatus(deps())).toEqual({ bootId: "boot-1", staged: false });
  });

  it("still reports a staged restore that a start failed to swap in", async () => {
    backups.staged = OFFERED;

    expect(await readRestoreStatus(deps())).toEqual({ bootId: "boot-1", staged: true });
  });
});
