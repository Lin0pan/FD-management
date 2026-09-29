import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaCustomerRepository } from "@/infrastructure/prisma/customer-repository";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
import { PrismaDistributionSessionRepository } from "@/infrastructure/prisma/distribution-session-repository";

/**
 * Composition root for the Übersichten tab: what every list it counts is read off. Only reads, so
 * no audit log (US-38).
 */
export const overviewDeps: {
  readonly customers: CustomerRepository;
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly clock: Clock;
} = {
  customers: new PrismaCustomerRepository(prisma),
  sessions: new PrismaDistributionSessionRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  clock: systemClock,
};
