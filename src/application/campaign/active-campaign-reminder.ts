import { CampaignReminderNotActive } from "@/domain/errors";
import type { CampaignReminder, CampaignReminderRepository } from "../ports";

/**
 * The reminder a write names, provided it is still the one switched on. Checked by id rather than
 * by „is one on": a screen left open across a switch-off and a switch-on again must never write
 * into the newer campaign.
 *
 * @throws {CampaignReminderNotActive} if `reminderId` is not the reminder switched on now.
 */
export async function requireActiveCampaignReminder(
  campaignReminders: CampaignReminderRepository,
  reminderId: number,
): Promise<CampaignReminder> {
  const active = await campaignReminders.findActive();
  if (active === null || active.id !== reminderId) {
    throw new CampaignReminderNotActive(reminderId);
  }
  return active;
}
