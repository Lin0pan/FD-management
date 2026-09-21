import type {
  AuditLog,
  CardRepository,
  CertificateRepository,
  CertificateTypeRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCardRepository } from "@/infrastructure/prisma/card-repository";
import { PrismaCertificateRepository } from "@/infrastructure/prisma/certificate-repository";
import { PrismaCertificateTypeRepository } from "@/infrastructure/prisma/certificate-type-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
import { PrismaDistributionSessionRepository } from "@/infrastructure/prisma/distribution-session-repository";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the customer screens: the one place the real adapters are chosen.
 *
 * The routes hand this object to a use case and do nothing else with it — the application layer only
 * ever sees the ports, so swapping SQLite or the clock touches this file alone.
 */
export const customerDeps: {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly certificates: CertificateRepository;
  readonly certificateTypes: CertificateTypeRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly sessions: DistributionSessionRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
} = {
  customers: new PrismaCustomerRepository(prisma),
  cards: new PrismaCardRepository(prisma),
  // A renewed certificate is recorded from the record as well as from the counter (US-16.5, FR-6):
  // the household brings the paperwork whenever they happen to bring it, not only when the counter
  // has just turned them away over it.
  certificates: new PrismaCertificateRepository(prisma),
  // The renewal's drop-down reads the configured Nachweis-Arten the same way the counter's does
  // (US-33.5/US-33.6).
  certificateTypes: new PrismaCertificateTypeRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  // The record shows how many of their own distributions a household has missed in a row (US-10.4),
  // which is derived from their hand-out history; the screens here only ever read it.
  records: new PrismaDistributionRecordRepository(prisma),
  // The afternoons those hand-outs were kept at: a miss is a session with no record, so the record
  // screen needs both halves (US-36.2).
  sessions: new PrismaDistributionSessionRepository(prisma),
  clock: systemClock,
  audit: new PrismaAuditLog(prisma),
};
