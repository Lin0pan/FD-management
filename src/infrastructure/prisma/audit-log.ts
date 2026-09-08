import type { PrismaClient } from "@prisma/client";
import type { AuditEntry, AuditLog } from "@/application/ports";

/** How the field list is flattened for SQLite, which has no array column type. */
const FIELD_SEPARATOR = ",";

/**
 * The SQLite-backed {@link AuditLog}. Append-only by construction — with no login the log is the only
 * accountability the system has, so an entry that could be rewritten would be worth nothing
 * (ADR-006).
 */
export class PrismaAuditLog implements AuditLog {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.auditEntry.create({
      data: {
        what: entry.what,
        changedFields: entry.changedFields.join(FIELD_SEPARATOR),
        when: entry.when,
        why: entry.why,
      },
    });
  }
}
