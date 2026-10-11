import type { CampaignReminderRepository, CustomerRepository } from "../ports";

export interface CampaignReminderForDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly customers: CustomerRepository;
}

/** What the checkbox needs; the reminder's id goes back with a tick so a stale screen is refused. */
export interface CampaignReminderCheckbox {
  readonly reminderId: number;
  readonly name: string;
  readonly received: boolean;
}

/**
 * The one read behind the checkbox at the counter and in the record, so both say the same thing.
 * `null` — no checkbox — while no reminder is on, or for a household that is archived or unknown.
 */
export async function campaignReminderFor(
  deps: CampaignReminderForDeps,
  customerId: number,
): Promise<CampaignReminderCheckbox | null> {
  const reminder = await deps.campaignReminders.findActive();
  if (reminder === null) {
    return null;
  }
  const customer = await deps.customers.findById(customerId);
  if (customer === null || customer.status === "ARCHIVED") {
    return null;
  }
  const receivedIds = await deps.campaignReminders.receivedCustomerIds(reminder.id);
  return { reminderId: reminder.id, name: reminder.name, received: receivedIds.has(customerId) };
}
