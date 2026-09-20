/**
 * End the afternoon (`tasks/prd-us-34-distribution-session.md` §US-34.4). The software never does
 * this by itself — not at midnight, not after a deadline (FR-5) — and ending freezes the session's
 * hand-outs: from this instant none of them is correctable any more.
 *
 * It is also the instant the households are **captured** (US-35, ADR-021): every hand-out keeps the
 * receipt of who stood at the counter, taken here because until now a correction still reaches the
 * record and after now nothing does.
 */

import type { RegisteredCustomer } from "@/domain/customer/customer";
import { receiptFor, type HandoutReceipt } from "@/domain/distribution/handoutReceipt";
import {
  formatSessionGroups,
  summariseSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import { CustomerNotFound, NoDistributionSessionRunning } from "@/domain/errors";
import type {
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  FrozenHandout,
} from "../ports";

/** The audit event one ended session is written under. */
const SESSION_ENDED = "distribution.session.ended";

/** What the entry names as changed: the three columns the session's own row is read by. */
const ENDED_FIELDS = ["startedAt", "endedAt", "groups"] as const;

export interface EndDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/**
 * One household's receipt, off its row as the register holds it at `at`. The whole row is read and
 * the receipt's own fields are named by the domain (`ReceiptHousehold`), so what is captured is
 * stated in one place rather than here.
 *
 * A household **moved to another number while the afternoon ran is captured under the new one**,
 * and so under its new group — in a RED-only session possibly as BLUE. Deliberately not prevented
 * (DF's answer J-1): the receipt says where the household stood when the session was closed.
 */
function receiptOf(customer: RegisteredCustomer, at: Date): HandoutReceipt {
  return receiptFor({
    customer: {
      customerNumber: customer.customerNumber,
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      certificateValidUntil: customer.details.certificate.validUntil,
      reminderCount: customer.reminderCount,
    },
    members: customer.details.householdMembers,
    card: customer.card,
    at,
  });
}

/**
 * End the running session and return what it came to.
 *
 * @throws {NoDistributionSessionRunning} if no session is running.
 * @throws {CustomerNotFound} if a hand-out names a household the register does not hold, which
 *   leaves the afternoon running rather than closing one that cannot be read back.
 * @throws {EmptyHousehold} if a served household holds no members, off `receiptFor`.
 * @throws {BirthDateInFuture} if one of its members was born after the ending instant. Both are
 *   refused at every write, so a freeze meeting one has found a row the register should not have
 *   been able to hold — and the afternoon stays open until it is put right.
 */
export async function endDistributionSession(
  deps: EndDistributionSessionDeps,
): Promise<SessionSummary> {
  const now = deps.clock.now();

  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }

  const handouts = await deps.records.listForSession(session.id);
  const summary = summariseSession(handouts);

  const receipts = await Promise.all(
    handouts.map(async (handout): Promise<FrozenHandout> => {
      // Joined by the surrogate id and never by the customer number: the slot may be freed and
      // given away, and a past afternoon may not name a household that was never at it (E-4).
      const customer = await deps.customers.findById(handout.customerId);
      if (customer === null) {
        throw new CustomerNotFound(handout.customerId);
      }
      return { recordId: handout.id, receipt: receiptOf(customer, now) };
    }),
  );

  // Frozen before the session is ended and never after it. There is no transaction across two
  // stores here, so the order is the guarantee: a freeze that fails leaves the afternoon running
  // and still correctable rather than closed and unreadable.
  await deps.records.freezeSession(session.id, receipts);
  await deps.sessions.end(session.id, now);
  // No human reason is asked for, so the entry has to tell its own story: the start instant the end
  // one cannot be read without, the groups served, and what the afternoon came to (ADR-006).
  await deps.audit.append({
    what: SESSION_ENDED,
    changedFields: [...ENDED_FIELDS],
    when: now,
    why:
      `startedAt=${session.startedAt.toISOString()}, ` +
      `groups=${formatSessionGroups(session.groups)}, ` +
      `households=${summary.households}, totalPaid=${summary.totalPaidCents}`,
  });

  return summary;
}
