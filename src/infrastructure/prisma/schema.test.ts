/**
 * A static guard on the one schema decision no runtime test can state in general: **nothing
 * cascades on delete** (US-10.3).
 *
 * The repository specs prove it for the customer's own relations by asking the database to delete a
 * household and being refused. This file makes the same statement about every model at once,
 * including any added tomorrow — `onDelete: Cascade` is a single word to type and the damage only
 * shows up the day something calls `delete`, by which time the household's history is gone.
 *
 * Reads the files rather than a database, so it costs nothing and runs with the pure tests.
 */

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The schema with its comments stripped. Several of them say the words `onDelete: Cascade` in order
 * to record that the cascade is absent on purpose, so matching the raw file would fail on its own
 * documentation.
 */
const DECLARATIONS = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS, entry.name, "migration.sql"), "utf8"))
    .join("\n");
}

describe("schema.prisma referential actions", () => {
  it("declares no cascading delete on any relation — a household is archived, never deleted", () => {
    expect(DECLARATIONS).not.toContain("onDelete: Cascade");
  });

  it("declares no other destructive delete action either — no SetNull, no SetDefault", () => {
    expect(DECLARATIONS).not.toContain("onDelete: SetNull");
    expect(DECLARATIONS).not.toContain("onDelete: SetDefault");
  });
});

describe("the committed migrations", () => {
  /**
   * The schema is what the next developer reads, but the migrations are what the database actually
   * runs — a hand-edited migration could reintroduce the cascade the schema forbids.
   */
  it("create no foreign key that deletes on cascade", () => {
    expect(migrationSql()).not.toMatch(/ON DELETE CASCADE/i);
  });

  /**
   * Prisma's default action for an *optional* relation is `SET NULL`, not `RESTRICT` — so a nullable
   * link such as `previousCustomerId` silently becomes destructive unless the action is spelled out.
   * The schema test above cannot see it: the omission is the bug, and only the generated SQL says so.
   */
  it("create no foreign key that nulls a link on delete either", () => {
    expect(migrationSql()).not.toMatch(/ON DELETE SET NULL/i);
  });

  it("keep the hand-written partial unique index that frees an archived customer's number", () => {
    expect(migrationSql()).toContain(
      'CREATE UNIQUE INDEX "Customer_customerNumber_onRegister_key"',
    );
  });

  it("index the archive search by folded last name and birthdate, the pair staff type", () => {
    expect(migrationSql()).toContain(
      'CREATE INDEX "Customer_lastNameFolded_birthDate_idx" ON "Customer"("lastNameFolded", "birthDate")',
    );
  });

  it("index the waiting list by arrival, which is the whole of a place in the queue", () => {
    expect(migrationSql()).toContain(
      'CREATE INDEX "WaitingListEntry_addedOn_idx" ON "WaitingListEntry"("addedOn")',
    );
  });

  it("index the distribution records by customer and date, which the no-show count reads", () => {
    expect(migrationSql()).toContain(
      'CREATE INDEX "DistributionRecord_customerId_date_idx" ON "DistributionRecord"("customerId", "date")',
    );
  });
});
