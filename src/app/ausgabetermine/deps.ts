import type {
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "@/application/ports";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaDistributionRecordRepository } from "@/infrastructure/prisma/distribution-record-repository";
import { PrismaDistributionSessionRepository } from "@/infrastructure/prisma/distribution-session-repository";

/**
 * Composition root for the Ausgabetermine screens: the afternoons and the hand-outs recorded at
 * them, and nothing else.
 *
 * No audit log, because there is nothing here to audit — both routes only ever read, and a past
 * afternoon is read-only by construction (US-37.3). A screen that cannot reach the log cannot
 * forget to write one.
 */
export const pastSessionDeps: {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
} = {
  sessions: new PrismaDistributionSessionRepository(prisma),
  records: new PrismaDistributionRecordRepository(prisma),
};
