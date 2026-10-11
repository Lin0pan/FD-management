import { Prisma, type PrismaClient } from "@prisma/client";
import type { CampaignReminder, CampaignReminderRepository } from "@/application/ports";
import type { CampaignReminderName } from "@/domain/campaign/campaignReminder";
import { CampaignReminderAlreadyActive } from "@/domain/errors";

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
    await this.prisma.campaignReminder.update({ where: { id: reminderId }, data: { name } });
  }

  async end(reminderId: number, at: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.campaignReminderTick.deleteMany({ where: { reminderId } }),
      this.prisma.campaignReminder.update({ where: { id: reminderId }, data: { endedAt: at } }),
    ]);
  }

  async receivedCustomerIds(reminderId: number): Promise<ReadonlySet<number>> {
    const rows = await this.prisma.campaignReminderTick.findMany({
      where: { reminderId },
      select: { customerId: true },
    });
    return new Set(rows.map((row) => row.customerId));
  }

  /**
   * A tick landing from a second workstation between the upsert's read and its insert is refused
   * by the unique index — the household is ticked either way, so that refusal is success.
   */
  async setReceived(reminderId: number, customerId: number, received: boolean): Promise<void> {
    if (!received) {
      await this.prisma.campaignReminderTick.deleteMany({ where: { reminderId, customerId } });
      return;
    }
    try {
      await this.prisma.campaignReminderTick.upsert({
        where: { reminderId_customerId: { reminderId, customerId } },
        create: { reminderId, customerId },
        update: {},
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}
