import { CampaignReminderNotActive } from "@/domain/errors";
import type { AuditLog, CampaignReminderRepository, Clock, CustomerRepository } from "../ports";
import { readCampaignReminder } from "./read-campaign-reminder";

export interface EndCampaignReminderDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly customers: CustomerRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface EndCampaignReminderInput {
  readonly reminderId: number;
}

/**
 * Switch the reminder off, deleting every tick (ADR-023). The audit entry names the ticks lost as
 * the settings counted them — the number the confirmation showed DF.
 *
 * @throws {CampaignReminderNotActive} if `reminderId` is not the reminder switched on now.
 */
export async function endCampaignReminder(
  deps: EndCampaignReminderDeps,
  input: EndCampaignReminderInput,
): Promise<void> {
  const state = await readCampaignReminder(deps);
  if (state === null || state.id !== input.reminderId) {
    throw new CampaignReminderNotActive(input.reminderId);
  }

  const when = deps.clock.now();
  await deps.campaignReminders.end(state.id, when);
  await deps.audit.append({
    what: "campaignReminder.ended",
    changedFields: ["name"],
    when,
    why: `${state.name} · ${state.received} Häkchen`,
  });
}
