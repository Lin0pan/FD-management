/**
 * Log one certificate reminder — the write that makes the grace period documented rather than
 * remembered (`tasks/prd-us-06-certificate-reminder.md` §US-06.2). Three guards stand before it:
 *
 *  1. **A session is running** (US-34, FR-10) — a reminder is given at the counter, so it belongs to
 *     an afternoon exactly as a hand-out does.
 *  2. **Something to remind about** (`isExpired`) — a reminder on a valid certificate would start a
 *     trail on a household that owes no renewal.
 *  3. **Once per session**, so a mis-click cannot consume the grace period (FR-5, US-34 FR-13). The
 *     database repeats it as a unique constraint (US-06.3).
 *
 * What the resulting count *means* is deliberately not decided here: no threshold exists anywhere
 * (PRD §5), and the count is returned for staff to judge.
 */

import { isExpired } from "@/domain/customer/certificate";
import {
  CertificateStillValid,
  CustomerNotFound,
  NoDistributionSessionRunning,
  ReminderAlreadyLoggedInSession,
} from "@/domain/errors";
import type {
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionSessionRepository,
  ReminderLogRepository,
} from "../ports";

/** The audit event name every logged reminder is written under. */
const REMINDER_LOGGED = "customer.reminder.logged";

export interface RecordReminderDeps {
  readonly customers: CustomerRepository;
  readonly reminders: ReminderLogRepository;
  readonly sessions: DistributionSessionRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RecordReminderInput {
  /** The surrogate id of the customer reminded — resolved by the counter before this is called. */
  readonly customerId: number;
}

/**
 * Record that the customer was reminded at this session, and return the resulting count. Nothing is
 * written unless all three guards pass; the audit entry carries the count in its `why`, since no
 * human reason is asked for and the trail must be readable from the log alone (ADR-006).
 *
 * @throws {NoDistributionSessionRunning} if no distribution session is running.
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CertificateStillValid} if the certificate has not lapsed as of today.
 * @throws {ReminderAlreadyLoggedInSession} if a reminder for this session is already on file.
 */
export async function recordReminder(
  deps: RecordReminderDeps,
  input: RecordReminderInput,
): Promise<number> {
  const now = deps.clock.now();

  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }

  const customer = await deps.customers.findById(input.customerId);
  if (customer === null) {
    throw new CustomerNotFound(input.customerId);
  }

  const certificate = customer.details.certificate;
  if (!isExpired(certificate, now)) {
    throw new CertificateStillValid(certificate.validUntil, now);
  }

  const existing = await deps.reminders.findInSession(input.customerId, session.id);
  if (existing !== null) {
    throw new ReminderAlreadyLoggedInSession(input.customerId, session.id);
  }

  const resultingCount = customer.reminderCount + 1;
  await deps.reminders.record(input.customerId, { sessionId: session.id, resultingCount });

  await deps.audit.append({
    what: REMINDER_LOGGED,
    changedFields: ["reminderCount"],
    when: now,
    why: `reminderCount=${resultingCount}`,
  });

  return resultingCount;
}
