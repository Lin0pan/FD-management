/**
 * The campaign reminder switched on and how far the campaign has got (US-40) — what the settings
 * show as „x von y abgehakt".
 */

import { campaignProgress, type CampaignProgress } from "@/domain/campaign/campaignReminder";
import type { CampaignReminder, CampaignReminderRepository, CustomerRepository } from "../ports";

export interface ReadCampaignReminderDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly customers: CustomerRepository;
}

export type CampaignReminderState = CampaignReminder & CampaignProgress;

/** `null` while no reminder is on. Active and blocked households count; the waiting list does not. */
export async function readCampaignReminder(
  deps: ReadCampaignReminderDeps,
): Promise<CampaignReminderState | null> {
  const reminder = await deps.campaignReminders.findActive();
  if (reminder === null) {
    return null;
  }
  const [active, blocked, receivedIds] = await Promise.all([
    deps.customers.listWithStatus("ACTIVE"),
    deps.customers.listWithStatus("BLOCKED"),
    deps.campaignReminders.receivedCustomerIds(reminder.id),
  ]);
  return { ...reminder, ...campaignProgress([...active, ...blocked], receivedIds) };
}
