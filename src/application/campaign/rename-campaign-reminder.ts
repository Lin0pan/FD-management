import { createCampaignReminderName } from "@/domain/campaign/campaignReminder";
import type { AuditLog, CampaignReminderRepository, Clock } from "../ports";
import { requireActiveCampaignReminder } from "./active-campaign-reminder";

export interface RenameCampaignReminderDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface RenameCampaignReminderInput {
  readonly reminderId: number;
  readonly name: string;
}

/**
 * Rename the reminder switched on; its ticks stay (US-40). The same name re-submitted writes
 * neither the name nor an audit entry.
 *
 * @throws {MissingRequiredField} naming `name` if the name is blank.
 * @throws {CampaignReminderNameTooLong} if the name is longer than the counter's label allows.
 * @throws {CampaignReminderNotActive} if `reminderId` is not the reminder switched on now.
 */
export async function renameCampaignReminder(
  deps: RenameCampaignReminderDeps,
  input: RenameCampaignReminderInput,
): Promise<void> {
  const name = createCampaignReminderName(input.name);
  const active = await requireActiveCampaignReminder(deps.campaignReminders, input.reminderId);
  if (active.name === name) {
    return;
  }

  await deps.campaignReminders.rename(active.id, name);
  await deps.audit.append({
    what: "campaignReminder.renamed",
    changedFields: ["name"],
    when: deps.clock.now(),
    why: `„${active.name}“ → „${name}“`,
  });
}
