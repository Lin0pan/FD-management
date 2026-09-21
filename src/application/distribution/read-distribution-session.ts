/**
 * One afternoon read back with the households that collected at it — what `/ausgabetermine/[id]`
 * lays out (`tasks/prd-us-37-session-overview-and-detail.md` §US-37.2).
 *
 * A row has two possible sources, the receipt taken when the afternoon was closed and the household
 * as the register holds it today, and **this file is the only place that tells them apart**. Asked
 * a second time in a component, the question would put a frozen name in one column beside a live
 * one in the next — the table nobody can check (E-8).
 */

import { formatCardNumber } from "@/domain/card/cardNumber";
import { groupOf, type Group } from "@/domain/customer/group";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import { composition } from "@/domain/customer/householdComposition";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import type { HandoutReceipt } from "@/domain/distribution/handoutReceipt";
import { isRunning, type DistributionSession } from "@/domain/distribution/session";
import { CustomerNotFound, DistributionSessionNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";

export interface ReadDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly customers: CustomerRepository;
  readonly clock: Clock;
}

/** One household that collected, with everything the detail view prints about it. */
export interface CollectedHousehold {
  /** The household itself, by the id a past afternoon names it under — never by the slot held. */
  readonly customerId: number;
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  /** `formatCardNumber` over the slot the card was **printed under** and its index (ADR-016). */
  readonly cardNumber: string;
  /** `groupOf` the number on this row (ADR-017); stored nowhere, here or on the receipt. */
  readonly group: Group;
  readonly grownUps: number;
  readonly children: number;
  readonly priceCents: Cents;
  readonly certificateValidUntil: Date;
  readonly reminderCount: number;
  readonly paidCents: Cents;
  /** When the household was served, which an afternoon left running overnight can outlive. */
  readonly at: Date;
}

/** One afternoon and the households it served. */
export interface DistributionSessionDetail {
  readonly session: DistributionSession;
  /** The households that collected, **in customer-number order** — how a register is read. */
  readonly households: ReadonlyArray<CollectedHousehold>;
  /**
   * Whether the rows are the households *as they stood*. False while the afternoon is open, nothing
   * being frozen until it closes, and false for one ended before the capture existed (US-35): those
   * rows are today's record, which the screen says out loud rather than leaving columns empty.
   */
  readonly frozen: boolean;
}

/** A row off the receipt: the household as it stood when the afternoon closed (US-35, ADR-021). */
function asItStood(handout: DistributionRecord, receipt: HandoutReceipt): CollectedHousehold {
  return {
    customerId: handout.customerId,
    customerNumber: receipt.customerNumber,
    firstName: receipt.firstName,
    lastName: receipt.lastName,
    cardNumber: formatCardNumber(receipt.cardCustomerNumber, receipt.cardIndex),
    group: groupOf(receipt.customerNumber),
    grownUps: receipt.grownUps,
    children: receipt.children,
    priceCents: handout.priceCents,
    certificateValidUntil: receipt.certificateValidUntil,
    reminderCount: receipt.reminderCount,
    paidCents: handout.paidCents,
    at: handout.date,
  };
}

/**
 * A row off the register as it stands: the counts derived at `today` like everywhere else, so a
 * household whose child turned 13 reads the same here as on its own record.
 *
 * @throws {EmptyHousehold} if the household holds no members.
 * @throws {BirthDateInFuture} if one of them was born after `today`.
 */
function asItStands(
  handout: DistributionRecord,
  customer: RegisteredCustomer,
  today: Date,
): CollectedHousehold {
  const counts = composition(customer.details.householdMembers, today);
  return {
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
    group: groupOf(customer.customerNumber),
    grownUps: counts.grownUps,
    children: counts.children,
    priceCents: handout.priceCents,
    certificateValidUntil: customer.details.certificate.validUntil,
    reminderCount: customer.reminderCount,
    paidCents: handout.paidCents,
    at: handout.date,
  };
}

/**
 * Read one afternoon and the households that collected at it. Nothing is written.
 *
 * @throws {DistributionSessionNotFound} if the id belongs to no session, or to a discarded one.
 * @throws {CustomerNotFound} if a live row names a household the register does not hold.
 */
export async function readDistributionSession(
  deps: ReadDistributionSessionDeps,
  sessionId: number,
): Promise<DistributionSessionDetail> {
  const session = await deps.sessions.findById(sessionId);
  if (session === null) {
    throw new DistributionSessionNotFound(sessionId);
  }

  const handouts = await deps.records.listForSession(session.id);
  // The one place the two sources are told apart (E-5): an ended afternoon is read off the receipts
  // taken when it closed, and a running — or reopened — one off the register, because nothing is
  // frozen until the afternoon is over.
  const frozen = isRunning(session)
    ? new Map<number, HandoutReceipt>()
    : new Map(
        (await deps.records.listFrozen(session.id)).map(({ recordId, receipt }) => [
          recordId,
          receipt,
        ]),
      );

  const today = deps.clock.now();
  const households = await Promise.all(
    handouts.map(async (handout): Promise<CollectedHousehold> => {
      const receipt = frozen.get(handout.id);
      if (receipt !== undefined) {
        return asItStood(handout, receipt);
      }
      const customer = await deps.customers.findById(handout.customerId);
      if (customer === null) {
        throw new CustomerNotFound(handout.customerId);
      }
      return asItStands(handout, customer, today);
    }),
  );

  return {
    session,
    households: [...households].sort((one, other) => one.customerNumber - other.customerNumber),
    // A session ended before US-35 carries no receipt for its hand-outs, which is the one way an
    // ended afternoon still reads live — and the screen has to say so (E-10).
    frozen: !isRunning(session) && handouts.every((handout) => frozen.has(handout.id)),
  };
}
