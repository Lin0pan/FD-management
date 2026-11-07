import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import type { BackupInspection, DatabaseBackups } from "@/application/ports";
import type { MigrationRecord } from "@/domain/backup/backup";
import { BackupMigrationFailed } from "@/domain/errors";

/** The first sixteen bytes of every SQLite 3 database file. */
const SQLITE_HEADER = "SQLite format 3\u0000";

/** The files SQLite may keep beside a database while, or after, it is open. */
const SIDECARS = ["-wal", "-shm", "-journal"];

/** Runs `prisma migrate deploy` against one file. Injectable, so a test can make it fail. */
export type MigrateDatabase = (databaseFile: string) => Promise<void>;

/** The Windows spawn is `test-support.ts`'s, for the reasons given there. */
export const migrateWithPrismaCli: MigrateDatabase = async (databaseFile) => {
  const args = ["prisma", "migrate", "deploy"];
  const [file, argv]: [string, string[]] =
    process.platform === "win32" ? ["cmd.exe", ["/d", "/c", "npx.cmd", ...args]] : ["npx", args];
  await promisify(execFile)(file, argv, {
    env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
  });
};

export interface FileDatabaseBackupsOptions {
  /** The client on the live register. Never used by the start-up swap, which runs before it opens. */
  readonly prisma: PrismaClient;
  /** Absolute path of the register file. The candidate and the staged restore live beside it. */
  readonly databaseFile: string;
  readonly migrationsDirectory: string;
  readonly safetyCopyDirectory: string;
  readonly migrate?: MigrateDatabase;
}

/** A client on a file other than the register, closed again whatever `work` does. */
async function withDatabase<T>(
  file: string,
  work: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    return await work(client);
  } finally {
    await client.$disconnect();
  }
}

async function removeWithSidecars(file: string): Promise<void> {
  await Promise.all(
    [file, ...SIDECARS.map((suffix) => file + suffix)].map((f) => rm(f, { force: true })),
  );
}

async function hasSqliteHeader(file: string): Promise<boolean> {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString("latin1") === SQLITE_HEADER;
  } finally {
    await handle.close();
  }
}

interface MigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: unknown;
  rolled_back_at: unknown;
}

/**
 * The SQLite-file {@link DatabaseBackups}. Every copy is made with `VACUUM INTO`, which reads through
 * an open WAL and writes one self-contained file — a plain file copy of a register in use could
 * capture half a transaction.
 */
export class FileDatabaseBackups implements DatabaseBackups {
  private readonly prisma: PrismaClient;
  private readonly databaseFile: string;
  private readonly candidateFile: string;
  private readonly stagedFile: string;
  private readonly migrationsDirectory: string;
  private readonly safetyCopyDirectory: string;
  private readonly migrate: MigrateDatabase;

  constructor(options: FileDatabaseBackupsOptions) {
    this.prisma = options.prisma;
    this.databaseFile = options.databaseFile;
    this.candidateFile = `${options.databaseFile}.restore-candidate`;
    this.stagedFile = `${options.databaseFile}.restore-staged`;
    this.migrationsDirectory = options.migrationsDirectory;
    this.safetyCopyDirectory = options.safetyCopyDirectory;
    this.migrate = options.migrate ?? migrateWithPrismaCli;
  }

  async snapshot(): Promise<Uint8Array> {
    const file = `${this.databaseFile}.snapshot-${randomUUID()}`;
    try {
      await this.prisma.$executeRaw`VACUUM INTO ${file}`;
      return new Uint8Array(await readFile(file));
    } finally {
      await removeWithSidecars(file);
    }
  }

  async lastCreatedAt(): Promise<Date | null> {
    const entry = await this.prisma.auditEntry.findFirst({
      where: { what: "backup.created" },
      orderBy: { when: "desc" },
    });
    return entry?.when ?? null;
  }

  /** Prisma's checksum is the SHA-256 of `migration.sql`, so it is recomputed the same way here. */
  async softwareMigrations(): Promise<ReadonlyArray<MigrationRecord>> {
    const entries = await readdir(this.migrationsDirectory, { withFileTypes: true });
    const records: MigrationRecord[] = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const sql = join(this.migrationsDirectory, entry.name, "migration.sql");
      if (existsSync(sql)) {
        const checksum = createHash("sha256")
          .update(await readFile(sql))
          .digest("hex");
        records.push({ name: entry.name, checksum });
      }
    }
    return records;
  }

  async receiveCandidate(content: Uint8Array): Promise<void> {
    await removeWithSidecars(this.candidateFile);
    await writeFile(this.candidateFile, content);
  }

  async inspectCandidate(): Promise<BackupInspection | null> {
    if (!(await hasSqliteHeader(this.candidateFile))) {
      return null;
    }
    try {
      return await withDatabase(this.candidateFile, async (client) => {
        const check =
          await client.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
        const intact = check.length === 1 && check[0]?.integrity_check === "ok";
        const tables = await client.$queryRawUnsafe<{ name: string }[]>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'",
        );
        if (tables.length === 0) {
          return { intact, migrations: [] };
        }
        const rows = await client.$queryRawUnsafe<MigrationRow[]>(
          "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations",
        );
        const applied = rows.filter((row) => row.rolled_back_at === null);
        const unfinished = applied.some((row) => row.finished_at === null);
        return {
          intact: intact && !unfinished,
          migrations: applied.map((row) => ({ name: row.migration_name, checksum: row.checksum })),
        };
      });
    } catch {
      // A file damaged badly enough fails on open or on the first page read rather than in the check.
      return { intact: false, migrations: [] };
    }
  }

  async migrateCandidate(): Promise<void> {
    try {
      await this.migrate(this.candidateFile);
    } catch {
      throw new BackupMigrationFailed();
    }
  }

  async discardCandidate(): Promise<void> {
    await removeWithSidecars(this.candidateFile);
  }

  async stageCandidate(): Promise<void> {
    await removeWithSidecars(this.stagedFile);
    await rename(this.candidateFile, this.stagedFile);
  }

  hasStagedRestore(): Promise<boolean> {
    return Promise.resolve(existsSync(this.stagedFile));
  }

  async preserveCurrent(fileName: string): Promise<void> {
    if (!existsSync(this.databaseFile)) {
      return;
    }
    await mkdir(this.safetyCopyDirectory, { recursive: true });
    const target = join(this.safetyCopyDirectory, fileName);
    await withDatabase(this.databaseFile, (client) => client.$executeRaw`VACUUM INTO ${target}`);
  }

  async swapInStaged(): Promise<void> {
    await Promise.all(SIDECARS.map((suffix) => rm(this.databaseFile + suffix, { force: true })));
    await rename(this.stagedFile, this.databaseFile);
  }
}

/**
 * The register's path from a `file:` URL. A relative one is relative to `prisma/`, where the schema
 * lives — the convention the CLI and the generated client share.
 */
export function databaseFileFromUrl(url: string, projectRoot: string): string {
  const path = url.replace(/^file:/, "").replace(/\?.*$/, "");
  return isAbsolute(path) ? path : resolve(projectRoot, "prisma", path);
}
