/**
 * Record a renewed needs certificate — the one legitimate way a reminder count returns to zero
 * (tasks/prd-us-06-certificate-reminder.md §US-06.2, FR-4).
 *
 * The customer brought the renewal the reminders asked for, so the record and the reset belong
 * together: the repository writes both in one transaction, and a renewal that landed without its
 * reset would show a customer still owing what they have just brought. The certificate is
 * *appended* — the trail of renewals stays readable (FR-8) — and the reminder *log* is untouched:
 * reminders that were given stay given, only the running count starts over.
 *
 * A renewal exists to restore the proof of need, so an end date already in the past is refused as a
 * typo ({@link CertificateValidUntilInPast}) rather than appended. The same expiry rule the counter
 * reads (`isExpired`) decides it, so "in the past" cannot mean two different days: an end date of
 * today is accepted, because a certificate is valid through its last day.
 */

import { isExpired } from "@/domain/customer/certificate";
import type { NeedsCertificate } from "@/domain/customer/customer";
import {
  CertificateValidUntilInPast,
  CustomerNotFound,
  MissingRequiredField,
} from "@/domain/errors";
import type { AuditLog, CertificateRepository, Clock, CustomerRepository } from "../ports";

/** The audit event name every recorded renewal is written under. */
const CERTIFICATE_RENEWED = "customer.certificate.renewed";

export interface RenewCertificateDeps {
  readonly customers: CustomerRepository;
  readonly certificates: CertificateRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RenewCertificateInput {
  /** The surrogate id of the customer who brought the renewal. */
  readonly customerId: number;
  /** What kind of notice it is, as staff typed it — informational, no rule turns on it. */
  readonly type: string;
  /** The renewed certificate's last valid day. */
  readonly validUntil: Date;
}

/**
 * Record the renewed certificate and reset the customer's reminder count to zero, transactionally.
 *
 * The audit entry needs no reason: the changed fields already say what happened.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {MissingRequiredField} if the certificate type is blank.
 * @throws {CertificateValidUntilInPast} if `validUntil` has already lapsed as of today.
 */
export async function renewCertificate(
  deps: RenewCertificateDeps,
  input: RenewCertificateInput,
): Promise<void> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(input.customerId);
  if (customer === null) {
    throw new CustomerNotFound(input.customerId);
  }

  const type = input.type.trim();
  if (type === "") {
    throw new MissingRequiredField("certificate.type");
  }

  const certificate: NeedsCertificate = { type, validUntil: input.validUntil };
  if (isExpired(certificate, now)) {
    throw new CertificateValidUntilInPast(input.validUntil, now);
  }

  await deps.certificates.renew(input.customerId, certificate, now);

  await deps.audit.append({
    what: CERTIFICATE_RENEWED,
    changedFields: ["certificate.type", "certificate.validUntil", "reminderCount"],
    when: now,
    why: "",
  });
}
