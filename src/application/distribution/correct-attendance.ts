/**
 * Correct today's hand-out — the one amendment the history allows (tasks/prd-us-05-record-
 * attendance.md §US-05.2, FR-7).
 *
 * A record is mutable only on the Berlin day it was made (`canCorrect`); by the next day it is part
 * of the permanent history and this refuses with {@link RecordNoLongerCorrectable}. Two corrections
 * are offered, both same-day: flip the `paid` flag (a mistyped payment), or remove the record
 * outright (served the wrong customer). Removal is the single deletion the store permits — the
 * distribution history is otherwise append-only and never rewritten after the fact.
 *
 * Each correction writes its own audit entry; no reason is required, because the event name and the
 * changed field already say what happened (the same judgement `updateSettings` makes).
 */

import { canCorrect } from "@/domain/distribution/attendance";
import { DistributionRecordNotFound, RecordNoLongerCorrectable } from "@/domain/errors";
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
 * What to do to the record: set its paid flag to a new value, or remove it. A discriminated union so
 * the caller states exactly one intent and the use case has no third, undefined case to handle.
 */
export type CorrectAttendanceInput =
  | { readonly recordId: number; readonly action: "SET_PAID"; readonly paid: boolean }
  | { readonly recordId: number; readonly action: "REMOVE" };

/**
 * Amend or remove a record made today.
 *
 * @throws {DistributionRecordNotFound} if no record holds `recordId`.
 * @throws {RecordNoLongerCorrectable} if the record was made before today's Berlin day.
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

  await deps.records.setPaid(input.recordId, input.paid);
  await deps.audit.append({
    what: DISTRIBUTION_CORRECTED,
    changedFields: ["paid"],
    when: now,
    why: "",
  });
}
