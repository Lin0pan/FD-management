import type {
  AuditLog,
  CampaignReminderRepository,
  CertificateTypeRepository,
  Clock,
  CustomerCounter,
  CustomerRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCampaignReminderRepository } from "@/infrastructure/prisma/campaign-reminder-repository";
import { PrismaCertificateTypeRepository } from "@/infrastructure/prisma/certificate-type-repository";
import {
  PrismaCustomerCounter,
  PrismaCustomerRepository,
} from "@/infrastructure/prisma/customer-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the settings screen: the one place the real adapters are chosen.
 *
 * The route hands this object to a use case and does nothing else with it — the application layer
 * only ever sees the ports, so swapping SQLite or the clock touches this file alone.
 */
export const settingsDeps: {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly customers: CustomerCounter;
  readonly audit: AuditLog;
  readonly certificateTypes: CertificateTypeRepository;
} = {
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
  customers: new PrismaCustomerCounter(prisma),
  audit: new PrismaAuditLog(prisma),
  certificateTypes: new PrismaCertificateTypeRepository(prisma),
};

/**
 * The campaign reminder's section of the same screen (US-40). An object of its own because its
 * progress reads the register itself, where the policy's `customers` above only counts it.
 */
export const campaignReminderDeps: {
  readonly campaignReminders: CampaignReminderRepository;
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
} = {
  campaignReminders: new PrismaCampaignReminderRepository(prisma),
  customers: new PrismaCustomerRepository(prisma),
  audit: new PrismaAuditLog(prisma),
  clock: systemClock,
};
