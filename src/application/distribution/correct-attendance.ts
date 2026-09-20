/**
 * Correct a hand-out made at the session still running — the one amendment the history allows
 * (`tasks/prd-us-05-record-attendance.md` §US-05.2, FR-7; US-34, FR-14).
 *
 * A record is mutable exactly while its **own** session runs (`canCorrect`), which is why that
 * session is loaded rather than the running one: a reopened afternoon is correctable again and every
 * other one stays frozen. Removal is the single deletion the store permits; the history is otherwise
 * append-only.
 *
 * **A removal needs no code of its own to put the balance back** (US-29, rule 9): the balance is the
 * arithmetic of the surviving rows, which is the property ADR-015 was chosen for.
 *
 * **A new payment is judged against what was asked at that record's own session.** Today's amount to
 * pay already has this record's payment folded in, so a household settling an old debt would read as
 * paying ahead.
 */

import { canCorrect } from "@/domain/distribution/attendance";
import { askedForRecord } from "@/domain/distribution/balance";
import { requirePayment } from "@/domain/distribution/distributionRecord";
import {
  DistributionRecordNotFound,
  OverpaymentNotConfirmed,
  RecordNoLongerCorrectable,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  AuditLog,
  Clock,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";

/** The audit event names a correction is written under. */
const DISTRIBUTION_CORRECTED = "distribution.corrected";
const DISTRIBUTION_REMOVED = "distribution.removed";

export interface CorrectAttendanceDeps {
  readonly records: DistributionRecordRepository;
  readonly sessions: DistributionSessionRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/**
 * Set the amount handed over, or remove the record — a union, so the caller states exactly one intent.
 * `paidCents` goes through `requirePayment` for `recordAttendance`'s reason: a screen may not be the
 * only guard (FR-8), and a derived balance has no stored figure to correct against.
 */
export type CorrectAttendanceInput =
  | {
      readonly recordId: number;
      readonly action: "SET_PAYMENT";
      readonly paidCents: Cents;
      /** That an amount above what that session asked for was meant — see `recordAttendance`. */
      readonly overpaymentConfirmed?: boolean;
    }
  | { readonly recordId: number; readonly action: "REMOVE" };

/**
 * Amend or remove a record made at a session that is still running.
 *
 * @throws {DistributionRecordNotFound} if no record holds `recordId`.
 * @throws {RecordNoLongerCorrectable} if the session the record belongs to has ended.
 * @throws {InvalidPaymentAmount} if the amount is not a whole, non-negative number of cents.
 * @throws {OverpaymentNotConfirmed} if more than that session's amount was handed over unconfirmed.
 */
export async function correctAttendance(
  deps: CorrectAttendanceDeps,
  input: CorrectAttendanceInput,
): Promise<void> {
  const now = deps.clock.now();

  const record = await deps.records.findById(input.recordId);
  if (record === null) {
    throw new DistributionRecordNotFound(input.recordId);
  }
  if (!canCorrect(await deps.sessions.findById(record.sessionId))) {
    throw new RecordNoLongerCorrectable(input.recordId, record.sessionId);
  }

  if (input.action === "REMOVE") {
    await deps.records.remove(input.recordId);
    await deps.audit.append({
      what: DISTRIBUTION_REMOVED,
      changedFields: [],
      when: now,
      why: "",
    });
    return;
  }

  // Shape before meaning: an unreadable number is refused without a second read of the store.
  requirePayment(input.paidCents);

  // What the counter asked at the session this record was made in — replayed from the history, since
  // nothing stores it. The same question `lookupCustomer` asks, answered in one place.
  const askedCents = askedForRecord(await deps.records.listForCustomer(record.customerId), record);
  if (input.paidCents > askedCents && input.overpaymentConfirmed !== true) {
    throw new OverpaymentNotConfirmed(input.paidCents, askedCents);
  }

  await deps.records.setPayment(input.recordId, input.paidCents);
  await deps.audit.append({
    what: DISTRIBUTION_CORRECTED,
    changedFields: ["paidCents"],
    when: now,
    why: "",
  });
}
