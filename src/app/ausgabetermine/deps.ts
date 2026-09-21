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
 * Composition root for the Ausgabetermine screens: the afternoons, the hand-outs recorded at them,
 * and — for the detail view alone — the register a running afternoon's rows are read off.
 *
 * No audit log, because there is nothing here to audit — both routes only ever read, and a past
 * afternoon is read-only by construction (US-37.3). A screen that cannot reach the log cannot
 * forget to write one.
 */
export const pastSessionDeps: {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly customers: CustomerRepository;
  readonly clock: Clock;
} = {
  sessions: new PrismaDistributionSessionRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
  // Only a running or reopened afternoon reaches these two: its rows are the households as they
  // stand, counts and all, because nothing is frozen until the afternoon is closed (US-37.2).
  customers: new PrismaCustomerRepository(prisma),
  clock: systemClock,
};
