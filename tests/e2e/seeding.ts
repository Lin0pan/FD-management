import type { PrismaClient } from "@prisma/client";

/**
 * Take the given customer numbers back out of the register, so seeding them again succeeds.
 *
 * **This is what makes a retry work.** CI runs with `retries: 2` and these blocks are
 * `mode: "serial"`, so a retry re-runs `beforeAll` — and `@@unique([customerNumber])` means the
 * second attempt would die on the constraint before reaching the test, reporting a seed failure that
 * points nowhere near the hiccup that caused the retry.
 *
 * **Deleting is allowed here** although ADR-010 forbids hard-deleting a customer: that rule is about
 * DF's register, not a throwaway file recreated on every run — the same exception `clearRegister`
 * takes for the integration suite. The difference that matters is **scope**: `clearRegister` empties
 * everything, which no spec here may do, the register being shared with the spec running next.
 *
 * The delete order below *is* the schema's relation list, children first. A new relation to
 * `Customer` that is not added here fails the delete loudly rather than orphaning anything.
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
  // A receipt points at the hand-out it describes (US-35), so it goes first — children first.
  await prisma.handoutReceipt.deleteMany({ where: { record: where } });
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
  // which is correct — they are not that household's, they are the register's. `DistributionSession`
  // is absent for the same reason: an afternoon belongs to the register, not to a household.
}

/**
 * An **ended** distribution session for a spec to hang seeded hand-outs and reminders on (US-34).
 *
 * Ended, because the register is shared with the spec running next and a running session is state it
 * would inherit — a spec that needs a *running* one starts it through the screen. `groups` is the
 * column value `parseSessionGroups` reads: `RED`, `BLUE` or `RED,BLUE`.
 */
export async function seedEndedSession(
  prisma: PrismaClient,
  options: { readonly at: Date; readonly groups?: string },
): Promise<number> {
  const row = await prisma.distributionSession.create({
    data: { startedAt: options.at, endedAt: options.at, groups: options.groups ?? "RED,BLUE" },
    select: { id: true },
  });
  return row.id;
}
