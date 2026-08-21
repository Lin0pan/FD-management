import type { PrismaClient } from "@prisma/client";

/**
 * Take the given customer numbers back out of the register, so seeding them again succeeds.
 *
 * ## Why this exists
 *
 * Every spec here seeds its households in `test.beforeAll` on customer numbers of its own, and
 * `@@unique([customerNumber])` means seeding the same number twice fails. That is fine on a first
 * run — the register is deleted and re-migrated before the server boots — and it is fatal on a
 * **retry**.
 *
 * CI runs with `retries: 2`, and these describe blocks are `mode: "serial"`, so a retry re-runs the
 * whole block *including* `beforeAll`. Without this call the second attempt dies on the unique
 * constraint before reaching the test, and so does the third. One unrelated hiccup — a WebKit
 * `page.goto: internal error`, say — therefore takes the entire file down and reports
 * `Unique constraint failed on the fields: (customerNumber)` from a seed function, which points
 * nowhere near what actually went wrong. Retries are already paid for; this is what makes them work.
 *
 * ## Why deleting is allowed here
 *
 * [ADR-010](../../docs/architecture/adr/010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
 * forbids hard-deleting a customer, and the schema enforces it: no relation carries
 * `onDelete: Cascade`, so the database refuses a delete whose children are still present. That rule
 * is about DF's register, not about a throwaway file that is recreated on every run — the same
 * exception `clearRegister` in `src/infrastructure/prisma/test-support.ts` takes for the integration
 * suite. This is the e2e counterpart, and the difference that matters is **scope**: `clearRegister`
 * empties everything, which no spec here may do, because the register is shared and the spec running
 * next is asserting against what the last one left.
 *
 * The delete order below *is* the schema's relation list, children first. If a new relation to
 * `Customer` is added and not added here, the delete fails loudly rather than silently orphaning
 * anything — which is the behaviour ADR-010 bought.
 */
export async function releaseNumbers(
  prisma: PrismaClient,
  ...customerNumbers: ReadonlyArray<number>
): Promise<void> {
  const ids = (
    await prisma.customer.findMany({
      where: { customerNumber: { in: [...customerNumbers] } },
      select: { id: true },
    })
  ).map((customer) => customer.id);

  // The ordinary case on a first run: nothing seeded these numbers yet, so there is nothing to undo.
  if (ids.length === 0) return;

  const where = { customerId: { in: ids } };
  await prisma.distributionRecord.deleteMany({ where });
  await prisma.reminderLog.deleteMany({ where });
  await prisma.card.deleteMany({ where });
  await prisma.certificate.deleteMany({ where });
  await prisma.householdMember.deleteMany({ where });

  // A re-registered household points back at the archived record it was pre-filled from (US-11.3),
  // and that self-relation is `onDelete: Restrict` like every other. Dropping the link first is this
  // relation's version of "children first" — and the pointer may come from a customer *outside* the
  // set being released, which is why it is matched on `previousCustomerId` rather than on `id`.
  await prisma.customer.updateMany({
    where: { previousCustomerId: { in: ids } },
    data: { previousCustomerId: null },
  });

  await prisma.customer.deleteMany({ where: { id: { in: ids } } });

  // `AuditEntry` is deliberately absent: it holds no customer reference at all, because the log
  // records what, when and why and never who (ADR-006). Entries a released household produced stay,
  // which is correct — they are not that household's, they are the register's.
}
