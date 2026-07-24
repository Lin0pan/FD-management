/**
 * Record one hand-out — the transaction that turns a lookup into history (tasks/prd-us-05-record-
 * attendance.md §US-05.2).
 *
 * One call writes exactly one record: the customer showed up, paid (or did not), and owed the price
 * their household drew under the policy in force today. Two guards stand before the write, and both
 * are the use case's own — the counter screen is not the only one (FR-8):
 *
 *  1. **Eligibility.** The verdict is re-evaluated here (`evaluateAtCounter`), and an `ARCHIVED`,
 *     `BLOCKED` or `WRONG_GROUP` customer is refused with {@link NotClearToServe}. A hand-out looked
 *     up by customer number presents no card, so `OUTDATED_CARD` cannot arise; an expired certificate
 *     serves and reminds rather than refusing.
 *  2. **Once per day.** `canRecord` rejects a second record on the same Berlin day with
 *     {@link AlreadyServedToday}, and nothing is written. The database repeats the rule as a unique
 *     constraint (US-05.3), so a race that slips past this guard still cannot double-record.
 *
 * The price is resolved through `describeAllowance` at today's instant — the same seam the counter
 * screen reads — so the amount stored on the record is exactly the one staff saw.
 */

import { canRecord } from "@/domain/distribution/attendance";
import { evaluateAtCounter } from "@/domain/distribution/counterVerdict";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import { CustomerNotFound, NotClearToServe } from "@/domain/errors";
import { describeAllowance } from "../allowance/describe-allowance";
import { getWeekColour } from "../distribution/get-week-colour";
import type {
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";

/** The audit event name every recorded hand-out is written under. */
const DISTRIBUTION_RECORDED = "distribution.recorded";

export interface RecordAttendanceDeps {
  readonly customers: CustomerRepository;
  readonly records: DistributionRecordRepository;
  readonly settings: SettingsRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RecordAttendanceInput {
  /** The surrogate id of the customer served — resolved by the counter before this is called. */
  readonly customerId: number;
  /**
   * Whether they paid. Pre-set to `true` because most customers do (FR-4); the staff member clears
   * it before confirming when they did not.
   */
  readonly paid?: boolean;
}

/**
 * Record that the customer showed up today, and return the stored record.
 *
 * Nothing is written unless both guards pass.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {NotClearToServe} if the counter verdict refuses this customer today.
 * @throws {AlreadyServedToday} if a record for the customer already exists on today's Berlin day.
 * @throws {NoSettingsInForce} if no settings version had taken effect by today.
 */
export async function recordAttendance(
  deps: RecordAttendanceDeps,
  input: RecordAttendanceInput,
): Promise<DistributionRecord> {
  // One read of the clock for the verdict, the day-key and the price, so all three agree on "now".
  const now = deps.clock.now();
  const paid = input.paid ?? true;

  const customer = await deps.customers.findById(input.customerId);
  if (customer === null) {
    throw new CustomerNotFound(input.customerId);
  }

  const week = await getWeekColour(deps, now);
  const verdict = evaluateAtCounter({
    customer: {
      customerNumber: customer.customerNumber,
      status: customer.status,
      group: customer.group,
      blockReason: null,
      currentCardIndex: customer.card.index,
      certificateValidUntil: customer.details.certificate.validUntil,
      reminderCount: customer.reminderCount,
    },
    // A bare-number hand-out presents no card, so an outdated card can never be the reason.
    presentedCardIndex: null,
    today: now,
    weekColour: week.colour,
  });
  if (verdict.kind === "ARCHIVED" || verdict.kind === "BLOCKED" || verdict.kind === "WRONG_GROUP") {
    throw new NotClearToServe(verdict);
  }

  const recordability = canRecord(await deps.records.listForCustomer(input.customerId), now);
  if (recordability !== "OK") {
    throw recordability;
  }

  const allowance = await describeAllowance(deps, customer.details.householdMembers, now);
  const record = await deps.records.create({
    customerId: input.customerId,
    date: now,
    showedUp: true,
    paid,
    priceCents: allowance.priceCents,
  });

  await deps.audit.append({
    what: DISTRIBUTION_RECORDED,
    changedFields: ["showedUp", "paid", "priceCents"],
    when: now,
    why: "",
  });

  return record;
}
