import { describe, expect, it } from "vitest";
import {
  backupFileName,
  compareMigrationHistories,
  safetyCopyFileName,
  type MigrationRecord,
} from "./backup";

const INIT: MigrationRecord = { name: "20261011190927_init", checksum: "a1" };
const SECOND: MigrationRecord = { name: "20261102080000_add_backup", checksum: "b2" };
const THIRD: MigrationRecord = { name: "20261203080000_add_more", checksum: "c3" };

describe("compareMigrationHistories", () => {
  it("restores a backup written by this very version as it is", () => {
    expect(compareMigrationHistories([INIT, SECOND], [INIT, SECOND])).toEqual({ kind: "CURRENT" });
  });

  it("restores a backup from an older version and names the migrations it still needs", () => {
    expect(compareMigrationHistories([INIT], [INIT, SECOND, THIRD])).toEqual({
      kind: "BEHIND",
      missing: [SECOND.name, THIRD.name],
    });
  });

  it("refuses a backup from a newer version, which this software cannot read", () => {
    expect(compareMigrationHistories([INIT, SECOND, THIRD], [INIT, SECOND])).toEqual({
      kind: "AHEAD",
    });
  });

  it("refuses a backup whose history parted from this software's at some migration", () => {
    const other: MigrationRecord = { name: "20261105080000_elsewhere", checksum: "x9" };

    expect(compareMigrationHistories([INIT, other], [INIT, SECOND])).toEqual({
      kind: "DIVERGED",
    });
  });

  it("refuses a backup whose migration has the same name but different content", () => {
    const edited: MigrationRecord = { name: INIT.name, checksum: "edited" };

    expect(compareMigrationHistories([edited], [INIT])).toEqual({ kind: "DIVERGED" });
  });

  it("refuses a backup with no migration history at all as not one of ours", () => {
    expect(compareMigrationHistories([], [INIT])).toEqual({ kind: "FOREIGN" });
  });

  it("compares in migration order, not in the order the rows were read", () => {
    expect(compareMigrationHistories([SECOND, INIT], [INIT, SECOND])).toEqual({ kind: "CURRENT" });
  });
});

describe("backupFileName", () => {
  it("names the Berlin day, the Berlin time and the software version", () => {
    // 13:05 UTC is 14:05 in Berlin in winter.
    expect(backupFileName(new Date("2026-11-03T13:05:00.000Z"), "0.5.0")).toBe(
      "fd-backup_2026-11-03_14-05_v0.5.0.db",
    );
  });

  it("takes the Berlin day just after midnight, not the UTC one", () => {
    // 22:30 UTC on 28 June is 00:30 on 29 June in Berlin in summer.
    expect(backupFileName(new Date("2026-06-28T22:30:00.000Z"), "1.0.0")).toBe(
      "fd-backup_2026-06-29_00-30_v1.0.0.db",
    );
  });

  it("handles 29 February", () => {
    expect(backupFileName(new Date("2028-02-29T09:00:00.000Z"), "1.2.3")).toBe(
      "fd-backup_2028-02-29_10-00_v1.2.3.db",
    );
  });
});

describe("safetyCopyFileName", () => {
  it("is told apart from a backup DF took themselves", () => {
    expect(safetyCopyFileName(new Date("2026-11-03T13:05:09.000Z"), "0.5.0")).toBe(
      "fd-before-restore_2026-11-03_14-05-09_v0.5.0.db",
    );
  });
});
