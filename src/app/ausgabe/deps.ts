import type { Clock, SettingsRepository } from "@/application/ports";
import { systemClock } from "@/infrastructure/clock";
import { prisma } from "@/infrastructure/prisma/client";
import { PrismaSettingsRepository } from "@/infrastructure/prisma/settings-repository";

/**
 * Composition root for the distribution screen: the one place the real adapters are chosen.
 *
 * A week colour is derived, never stored, so this screen needs no repository beyond the settings
 * history — the anchor and the distribution weekday are all it reads.
 */
export const distributionDeps: {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
} = {
  settings: new PrismaSettingsRepository(prisma),
  clock: systemClock,
};
