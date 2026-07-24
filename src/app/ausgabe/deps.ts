import type { Clock, CustomerRepository, SettingsRepository } from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the distribution screen: the one place the real adapters are chosen.
 *
 * The week colour is derived from the settings history alone; the counter lookup adds the customer
 * register to that. Deliberately no audit log and no card repository: this screen only ever reads,
 * and a port it does not hold is a write it cannot make (US-04.2, FR-4).
 */
export const distributionDeps: {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
};
