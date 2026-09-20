/**
 * Record one hand-out — the transaction that turns a lookup into history
 * (`tasks/prd-us-05-record-attendance.md` §US-05.2, `tasks/prd-us-29-customer-balance.md` §US-29.4).
 *
 * Four guards stand before the write, all the use case's own because the screen is not allowed to be
 * the only one (FR-8). **Their order is load-bearing:**
 *
 *  1. **A session is running** (US-34, FR-10). First of all: a hand-out that belongs to no afternoon
 *     cannot be written at all, and the write needs its id.
 *  2. **Once per session** (`canRecord`). Before the verdict, because the counter verdict knows this
 *     session's hand-out too (US-32.4) — asked second, it would report a duplicate write as an
 *     eligibility refusal and reword the sentence the counter reads. The database repeats the rule
 *     as a unique `(customerId, sessionId)` constraint, so a race that slips past cannot
 *     double-record.
 *  3. **Eligibility** (`evaluateAtCounter`). `OUTDATED_CARD` cannot arise — a bare-number hand-out
 *     presents no card — and an expired certificate serves and reminds rather than refusing.
 *  4. **The payment.** Only now is an amount looked at; asked earlier, the screen would put a staff
 *     member to confirming a credit for a household that may not be served at all.
 *
 * The price comes through `describeAllowance` at today's instant, so the amount stored is the one
 * staff saw. What the household is *asked for* is that price offset by their balance — the arithmetic
 * of the very records the once-per-session guard already loaded (US-29, ADR-015).
 */

import { groupOf } from "@/domain/customer/group";
import { canRecord } from "@/domain/distribution/attendance";
import { amountToPay, balanceOf } from "@/domain/distribution/balance";
import { evaluateAtCounter } from "@/domain/distribution/counterVerdict";
import { requirePayment, type DistributionRecord } from "@/domain/distribution/distributionRecord";
import {
  CustomerNotFound,
  NoDistributionSessionRunning,
  NotClearToServe,
  OverpaymentNotConfirmed,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { describeAllowance } from "../allowance/describe-allowance";
import type {
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  SettingsRepository,
} from "../ports";

/** The audit event name every recorded hand-out is written under. */
const DISTRIBUTION_RECORDED = "distribution.recorded";

export interface RecordAttendanceDeps {
  readonly customers: CustomerRepository;
  readonly records: DistributionRecordRepository;
  readonly sessions: DistributionSessionRepository;
  readonly settings: SettingsRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RecordAttendanceInput {
  /** The surrogate id of the customer served — resolved by the counter before this is called. */
  readonly customerId: number;
  /**
   * What the household handed over. Omitted, it is **the amount they were asked for** — the ordinary
   * case, and the value the pre-filled field shows. Less becomes a debt without a question; more
   * needs {@link overpaymentConfirmed}.
   */
  readonly paidCents?: Cents;
  /**
   * That a payment above the amount asked for was meant. The screen submits without it, shows the
   * refusal, and submits again once confirmed — so a mistyped credit cannot be written in one click
   * and the rule stays here rather than in a component (FR-8).
   */
  readonly overpaymentConfirmed?: boolean;
}

/**
 * Record that the household collected at this session, and return the stored record. Nothing is
 * written unless all four guards pass.
 *
 * @throws {NoDistributionSessionRunning} if no distribution session is running.
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {NotClearToServe} if the counter verdict refuses this customer today.
 * @throws {AlreadyServedInSession} if the household already collected at this session.
 * @throws {NoSettingsInForce} if no settings version had taken effect by today.
 * @throws {InvalidPaymentAmount} if the amount is not a whole, non-negative number of cents.
 * @throws {OverpaymentNotConfirmed} if more than the amount asked for was handed over unconfirmed.
 */
export async function recordAttendance(
  deps: RecordAttendanceDeps,
  input: RecordAttendanceInput,
): Promise<DistributionRecord> {
  // One read of the clock for the verdict, the record's instant and the price, so all three agree
  // on "now".
  const now = deps.clock.now();

  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }

  const customer = await deps.customers.findById(input.customerId);
  if (customer === null) {
    throw new CustomerNotFound(input.customerId);
  }

  // One read of the history: the once-per-session guard needs it, and so does the balance.
  const history = await deps.records.listForCustomer(input.customerId);
  const recordability = canRecord(history, session.id);
  if (recordability !== "OK") {
    throw recordability;
  }

  const verdict = evaluateAtCounter({
    customer: {
      customerNumber: customer.customerNumber,
      status: customer.status,
      group: groupOf(customer.customerNumber),
      blockReason: null,
      currentCardIndex: customer.card.index,
      certificateValidUntil: customer.details.certificate.validUntil,
      reminderCount: customer.reminderCount,
    },
    // A bare-number hand-out presents no card, so an outdated card can never be the reason.
    presentedCardIndex: null,
    today: now,
    sessionGroups: session.groups,
    // `canRecord` has just proved there is no hand-out in this session, so the verdict is asked
    // about eligibility alone and `ALREADY_SERVED` cannot arise here (US-32.5).
    servedInSession: false,
  });
  if (verdict.kind === "ARCHIVED" || verdict.kind === "BLOCKED" || verdict.kind === "WRONG_GROUP") {
    throw new NotClearToServe(verdict);
  }

  const allowance = await describeAllowance(deps, customer.details.householdMembers, now);
  const amountToPayCents = amountToPay(allowance.priceCents, balanceOf(history));
  const paidCents = input.paidCents ?? amountToPayCents;
  requirePayment(paidCents);
  if (paidCents > amountToPayCents && input.overpaymentConfirmed !== true) {
    throw new OverpaymentNotConfirmed(paidCents, amountToPayCents);
  }

  const record = await deps.records.create({
    customerId: input.customerId,
    sessionId: session.id,
    date: now,
    showedUp: true,
    paidCents,
    priceCents: allowance.priceCents,
  });

  await deps.audit.append({
    what: DISTRIBUTION_RECORDED,
    changedFields: ["showedUp", "paidCents", "priceCents"],
    when: now,
    why: "",
  });

  return record;
}
