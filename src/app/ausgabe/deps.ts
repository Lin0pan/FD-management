import type {
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the distribution screen: the one place the real adapters are chosen.
 *
 * The week colour is derived from the settings history alone; the counter lookup adds the customer
 * register and — to show a hand-out already recorded today beside the serve action — the reading
 * side of the distribution store. It holds no audit log: the page only ever reads, and recording a
 * hand-out is the separate `counterActionDeps` below, so the page cannot write even by mistake
 * (US-04.2, FR-4).
 */
export const distributionDeps: {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  clock: systemClock,
};

/**
 * Composition root for the serve and correct actions — the write path the counter's server actions
 * hold, kept apart from the page's read deps above. This is the only object in the distribution
 * screen that carries the audit log and the writable distribution store.
 */
export const counterActionDeps: {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  audit: new PrismaAuditLog(prisma),
  clock: systemClock,
};
