import type { AuditLog, CampaignReminderRepository, Clock } from "../ports";
import { requireActiveCampaignReminder } from "./active-campaign-reminder";

export interface EndCampaignReminderDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface EndCampaignReminderInput {
  readonly reminderId: number;
}

/**
 * Switch the reminder off, deleting every tick (ADR-023). The audit entry names the ticks actually
 * deleted, archived households' included.
 *
 * @throws {CampaignReminderNotActive} if `reminderId` is not the reminder switched on now.
 */
export async function endCampaignReminder(
  deps: EndCampaignReminderDeps,
  input: EndCampaignReminderInput,
): Promise<void> {
  const active = await requireActiveCampaignReminder(deps.campaignReminders, input.reminderId);

  const when = deps.clock.now();
  const ticksDeleted = await deps.campaignReminders.end(active.id, when);
  await deps.audit.append({
    what: "campaignReminder.ended",
    changedFields: ["endedAt"],
    when,
    why: `name=${active.name}, ticksDeleted=${ticksDeleted}`,
  });
}
