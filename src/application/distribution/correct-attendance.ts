/**
 * Correct today's hand-out — the one amendment the history allows (tasks/prd-us-05-record-
 * attendance.md §US-05.2, FR-7).
 *
 * A record is mutable only on the Berlin day it was made (`canCorrect`); by the next day it is part
 * of the permanent history and this refuses with {@link RecordNoLongerCorrectable}. Two corrections
 * are offered, both same-day: set the amount that was handed over — a mistyped payment, or a
 * household that came back with the rest before the day was out — or remove the record outright
 * (served the wrong customer). Removal is the single deletion the store permits: the distribution
 * history is otherwise append-only and never rewritten after the fact.
 *
 * **A removal needs no code of its own to put the balance back** (US-29, rule 9). The balance is the
 * arithmetic of the surviving rows, so deleting a record deletes its payment with it and the
 * household returns to exactly where they stood — the property the derive-don't-store choice was
 * made for, and an application test says so.
 *
 * **A new payment is judged against what was asked for on that record's own day**, replayed from the
 * customer's history. Today's amount to pay is the wrong figure: it already has this record's own
 * payment folded into it, so a household settling an old debt would read as paying ahead.
 *
 * Each correction writes its own audit entry; no reason is required, because the event name and the
 * changed field already say what happened (the same judgement `updateSettings` makes).
 */

import { canCorrect } from "@/domain/distribution/attendance";
import { replayPayments } from "@/domain/distribution/balance";
import {
  DistributionRecordNotFound,
  OverpaymentNotConfirmed,
  RecordNoLongerCorrectable,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type { AuditLog, Clock, DistributionRecordRepository } from "../ports";

/** The audit event names a correction is written under. */
const DISTRIBUTION_CORRECTED = "distribution.corrected";
const DISTRIBUTION_REMOVED = "distribution.removed";

export interface CorrectAttendanceDeps {
  readonly records: DistributionRecordRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/**
 * What to do to the record: set the amount that was handed over, or remove it. A discriminated union
 * so the caller states exactly one intent and the use case has no third, undefined case to handle.
 *
 * `paidCents` is trusted to be a whole, non-negative amount: `parseEuros` refuses anything else at
 * the form boundary (US-29.7), and this layer does not re-check it.
 */
export type CorrectAttendanceInput =
  | {
      readonly recordId: number;
      readonly action: "SET_PAYMENT";
      readonly paidCents: Cents;
      /** That an amount above what was asked for that day was meant — see `recordAttendance`. */
      readonly overpaymentConfirmed?: boolean;
    }
  | { readonly recordId: number; readonly action: "REMOVE" };

/**
 * Amend or remove a record made today.
 *
 * @throws {DistributionRecordNotFound} if no record holds `recordId`.
 * @throws {RecordNoLongerCorrectable} if the record was made before today's Berlin day.
 * @throws {OverpaymentNotConfirmed} if more than that day's amount was handed over unconfirmed.
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
  if (!canCorrect(record, now)) {
    throw new RecordNoLongerCorrectable(input.recordId, record.date, now);
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

  // What the counter asked for on the day this record was made. Nothing stores it, so the customer's
  // history is replayed and the row belonging to this record read off the walk — its `askedCents` is
  // the price offset by the balance of the *earlier* hand-outs only, which is the figure a staff
  // member had in front of them. The record came out of `findById`, so it is one of these rows.
  const settlements = replayPayments(await deps.records.listForCustomer(record.customerId));
  const askedCents = settlements.reduce(
    (asked, settlement) =>
      settlement.record.id === input.recordId ? settlement.askedCents : asked,
    record.priceCents,
  );
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
