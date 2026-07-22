import type { PrismaClient } from "@prisma/client";
import type { AuditEntry, AuditLog } from "@/application/ports";

/** How the field list is flattened for SQLite, which has no array column type. */
const FIELD_SEPARATOR = ",";

/**
 * The SQLite-backed {@link AuditLog}.
 *
 * Append-only by construction — there is no update and no delete. With no login, the log is the only
 * accountability the system has, so an entry that could be rewritten would be worth nothing
 * (docs/tech_stack_architecture_sketch.md §5.2). It records *what* changed, *when* and *why*, and
 * deliberately never *who*.
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
