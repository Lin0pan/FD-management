import type {
  AuditLog,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
  WaitingListRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { PrismaAuditLog } from "@/infrastructure/prisma/audit-log";
import { PrismaCardRepository } from "@/infrastructure/prisma/card-repository";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";
import { PrismaWaitingListRepository } from "@/infrastructure/prisma/waiting-list-repository";

/**
 * Composition root for the waiting-list screens: the one place the real adapters are chosen.
 *
 * It carries more than the list itself because a promotion *is* a registration: the applicant is
 * registered through `registerCustomer` — same slot allocation, same first card, same audit entry —
 * and only then taken off the list, so the register, the cards and the settings all have to be here
 * (US-12.2). The routes hand this object to a use case and do nothing else with it.
 */
export const waitingListDeps: {
  readonly waitingList: WaitingListRepository;
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
} = {
  waitingList: new PrismaWaitingListRepository(prisma),
  customers: new PrismaCustomerRepository(prisma),
  cards: new PrismaCardRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
  audit: new PrismaAuditLog(prisma),
};
