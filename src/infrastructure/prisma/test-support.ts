/**
 * Helpers shared by the infrastructure integration tests. Test-only: nothing in `src/app`,
 * `src/application` or `src/domain` imports this module.
 */

import type { PrismaClient } from "@prisma/client";

/**
 * Empty the customer register and everything hanging off it, children first.
 *
 * No relation in schema.prisma cascades on delete (US-10.3): the database *refuses* to remove a
 * household that still owns members, a certificate, a card, a distribution record or a reminder log,
 * because in production the only way out of the register is archiving. That protection makes
 * `customer.deleteMany()` on its own a foreign-key error in any test that registered a household, so
 * the order below is the price of it — and having it stated once means the next table to be added
 * has one place to be listed rather than five.
 */
export async function clearRegister(prisma: PrismaClient): Promise<void> {
  await prisma.distributionRecord.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.card.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.householdMember.deleteMany();
  // A re-registered household points at the archived record it was pre-filled from (US-11.3), and
  // that link is `onDelete: Restrict` like every other: a customer with a successor cannot be
  // deleted either. Dropping the links first is the self-reference's version of "children first".
  await prisma.customer.updateMany({ data: { previousCustomerId: null } });
  await prisma.customer.deleteMany();
}
