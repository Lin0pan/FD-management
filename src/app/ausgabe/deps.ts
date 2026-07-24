import type {
  AuditLog,
  CertificateRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  ReminderLogRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCertificateRepository } from "@/infrastructure/prisma/certificate-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
import { PrismaReminderLogRepository } from "@/infrastructure/prisma/reminder-log-repository";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the distribution screen: the one place the real adapters are chosen.
 *
 * The week colour is derived from the settings history alone; the counter lookup adds the customer
 * register and — to show a hand-out already recorded today beside the serve action, and whether
 * today's certificate reminder is already logged — the reading side of the distribution and
 * reminder stores. It holds no audit log: the page only ever reads, and every write is the separate
 * `counterActionDeps` below, so the page cannot write even by mistake (US-04.2, FR-4).
 */
export const distributionDeps: {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  reminders: new PrismaReminderLogRepository(prisma),
  clock: systemClock,
};

/**
 * Composition root for the counter's server actions — the write path, kept apart from the page's
 * read deps above. This is the only object in the distribution screen that carries the audit log
 * and the writable stores: the distribution records (serve, correct), the reminder trail and the
 * certificate history (US-06.4).
 */
export const counterActionDeps: {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
  readonly certificates: CertificateRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  reminders: new PrismaReminderLogRepository(prisma),
  certificates: new PrismaCertificateRepository(prisma),
  audit: new PrismaAuditLog(prisma),
  clock: systemClock,
};
