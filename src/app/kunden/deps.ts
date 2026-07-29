import type {
  AuditLog,
  CardRepository,
  CertificateRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCardRepository } from "@/infrastructure/prisma/card-repository";
import { PrismaCertificateRepository } from "@/infrastructure/prisma/certificate-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
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
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
} = {
  customers: new PrismaCustomerRepository(prisma),
  cards: new PrismaCardRepository(prisma),
  // A renewed certificate is recorded from the record as well as from the counter (US-16.5, FR-6):
  // the household brings the paperwork whenever they happen to bring it, not only when the counter
  // has just turned them away over it.
  certificates: new PrismaCertificateRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  // The record shows how many of their own distributions a household has missed in a row (US-10.4),
  // which is derived from their hand-out history; the screens here only ever read it.
  records: new PrismaDistributionRecordRepository(prisma),
  clock: systemClock,
  audit: new PrismaAuditLog(prisma),
};
