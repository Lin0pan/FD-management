import type { AuditLog, Clock, CustomerCounter, SettingsRepository } from "@/application/ports";
import { emptyCustomerCounter } from "@/infrastructure/customer-counter";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
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
} = {
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
  customers: emptyCustomerCounter,
  audit: new PrismaAuditLog(prisma),
};
