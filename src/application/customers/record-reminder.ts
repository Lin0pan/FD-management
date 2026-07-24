/**
 * Log one certificate reminder — the write that makes the grace period documented rather than
 * remembered (tasks/prd-us-06-certificate-reminder.md §US-06.2).
 *
 * An expired certificate never blocks a hand-out; it starts a conversation at the counter, and this
 * use case records that the conversation happened. Two guards stand before the write:
 *
 *  1. **Something to remind about.** The certificate must actually have lapsed (`isExpired`) — a
 *     reminder on a valid certificate would start a trail on a customer who owes no renewal, so it
 *     is refused with {@link CertificateStillValid}.
 *  2. **Once per day.** A reminder already logged on today's Berlin day is a repeat — most likely a
 *     mis-click, which must not consume the customer's grace period (FR-5) — and is refused with
 *     {@link ReminderAlreadyLoggedToday}, writing nothing. The database repeats the rule as a unique
 *     constraint (US-06.3), so a race that slips past this guard still cannot double-log.
 *
 * The day is the **Berlin calendar day** (`berlinDayKey`), the same notion of "the same day" the
 * attendance rule uses, because both happen at the counter at a local moment. What the resulting
 * count *means* is deliberately not decided here: no threshold exists anywhere (PRD §5), and the
 * count is returned for staff to judge, never acted on.
 */

import { isExpired } from "@/domain/customer/certificate";
import { berlinDayKey } from "@/domain/distribution/attendance";
import {
  CertificateStillValid,
  CustomerNotFound,
  ReminderAlreadyLoggedToday,
} from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository, ReminderLogRepository } from "../ports";

/** The audit event name every logged reminder is written under. */
const REMINDER_LOGGED = "customer.reminder.logged";

export interface RecordReminderDeps {
  readonly customers: CustomerRepository;
  readonly reminders: ReminderLogRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RecordReminderInput {
  /** The surrogate id of the customer reminded — resolved by the counter before this is called. */
  readonly customerId: number;
}

/**
 * Record that the customer was reminded today, and return the resulting reminder count.
 *
 * Nothing is written unless both guards pass. The audit entry records the resulting count in its
 * free-text slot — the trail must be readable from the log alone, and no human reason is asked for.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CertificateStillValid} if the certificate has not lapsed as of today.
 * @throws {ReminderAlreadyLoggedToday} if a reminder for today's Berlin day is already on file.
 */
export async function recordReminder(
  deps: RecordReminderDeps,
  input: RecordReminderInput,
): Promise<number> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(input.customerId);
  if (customer === null) {
    throw new CustomerNotFound(input.customerId);
  }

  const certificate = customer.details.certificate;
  if (!isExpired(certificate, now)) {
    throw new CertificateStillValid(certificate.validUntil, now);
  }

  const loggedOn = berlinDayKey(now);
  const existing = await deps.reminders.findOnDay(input.customerId, loggedOn);
  if (existing !== null) {
    throw new ReminderAlreadyLoggedToday(input.customerId, loggedOn);
  }

  const resultingCount = customer.reminderCount + 1;
  await deps.reminders.record(input.customerId, { loggedOn, resultingCount });

  await deps.audit.append({
    what: REMINDER_LOGGED,
    changedFields: ["reminderCount"],
    when: now,
    why: `reminderCount=${resultingCount}`,
  });

  return resultingCount;
}
