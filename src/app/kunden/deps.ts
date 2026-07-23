import type {
  AuditLog,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCardRepository } from "@/infrastructure/prisma/card-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
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
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
} = {
  customers: new PrismaCustomerRepository(prisma),
  cards: new PrismaCardRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
  audit: new PrismaAuditLog(prisma),
};
