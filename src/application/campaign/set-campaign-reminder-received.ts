import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { CampaignReminderRepository, CustomerRepository } from "../ports";
import { requireActiveCampaignReminder } from "./active-campaign-reminder";

export interface SetCampaignReminderReceivedDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly customers: CustomerRepository;
}

export interface SetCampaignReminderReceivedInput {
  readonly reminderId: number;
  readonly customerId: number;
  readonly received: boolean;
}

/**
 * Tick a household off, or take the tick back — at any time, with or without a running session.
 * Deliberately not audited (ADR-024).
 *
 * @throws {CampaignReminderNotActive} if `reminderId` is not the reminder switched on now.
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register.
 */
export async function setCampaignReminderReceived(
  deps: SetCampaignReminderReceivedDeps,
  { reminderId, customerId, received }: SetCampaignReminderReceivedInput,
): Promise<void> {
  await requireActiveCampaignReminder(deps.campaignReminders, reminderId);

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  await deps.campaignReminders.setReceived(reminderId, customerId, received);
}
