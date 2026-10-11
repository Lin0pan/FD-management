import { Prisma, type PrismaClient } from "@prisma/client";
import type { CampaignReminder, CampaignReminderRepository } from "@/application/ports";
import type { CampaignReminderName } from "@/domain/campaign/campaignReminder";
import { CampaignReminderAlreadyActive, CampaignReminderNotActive } from "@/domain/errors";

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** SQLite names the index rather than a column for an index on an expression, so match the name. */
function isActiveReminderCollision(error: unknown): boolean {
  return (
    isUniqueViolation(error) &&
    JSON.stringify(error.meta ?? {}).includes("one_active_campaign_reminder")
  );
}

const SELECTED = { id: true, name: true, startedAt: true } as const;

/** The SQLite-backed {@link CampaignReminderRepository}. */
export class PrismaCampaignReminderRepository implements CampaignReminderRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async findActive(): Promise<CampaignReminder | null> {
    return this.prisma.campaignReminder.findFirst({ where: { endedAt: null }, select: SELECTED });
  }

  async start(name: CampaignReminderName, at: Date): Promise<CampaignReminder> {
    try {
      return await this.prisma.campaignReminder.create({
        data: { name, startedAt: at },
        select: SELECTED,
      });
    } catch (error: unknown) {
      if (isActiveReminderCollision(error)) {
        throw new CampaignReminderAlreadyActive();
      }
      throw error;
    }
  }

  async rename(reminderId: number, name: CampaignReminderName): Promise<void> {
    const { count } = await this.prisma.campaignReminder.updateMany({
      where: { id: reminderId, endedAt: null },
      data: { name },
    });
    if (count === 0) {
      throw new CampaignReminderNotActive(reminderId);
    }
  }

  async end(reminderId: number, at: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const stamped = await tx.campaignReminder.updateMany({
        where: { id: reminderId, endedAt: null },
        data: { endedAt: at },
      });
      if (stamped.count === 0) {
        throw new CampaignReminderNotActive(reminderId);
      }
      const deleted = await tx.campaignReminderTick.deleteMany({ where: { reminderId } });
      return deleted.count;
    });
  }

  async receivedCustomerIds(reminderId: number): Promise<ReadonlySet<number>> {
    const rows = await this.prisma.campaignReminderTick.findMany({
      where: { reminderId },
      select: { customerId: true },
    });
    return new Set(rows.map((row) => row.customerId));
  }

  /**
   * The tick is written before the reminder is checked, so SQLite's write lock orders it against a
   * concurrent `end`: either the switch-off deletes it, or it sees the switch-off and rolls back.
   */
  async setReceived(reminderId: number, customerId: number, received: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (received) {
        try {
          await tx.campaignReminderTick.upsert({
            where: { reminderId_customerId: { reminderId, customerId } },
            create: { reminderId, customerId },
            update: {},
          });
        } catch (error: unknown) {
          // A second workstation's tick landed between the upsert's read and its insert.
          if (!isUniqueViolation(error)) {
            throw error;
          }
        }
      } else {
        await tx.campaignReminderTick.deleteMany({ where: { reminderId, customerId } });
      }
      const active = await tx.campaignReminder.count({ where: { id: reminderId, endedAt: null } });
      if (active === 0) {
        throw new CampaignReminderNotActive(reminderId);
      }
    });
  }
}
