import { createCampaignReminderName } from "@/domain/campaign/campaignReminder";
import { CampaignReminderAlreadyActive } from "@/domain/errors";
import type { AuditLog, CampaignReminder, CampaignReminderRepository, Clock } from "../ports";

export interface StartCampaignReminderDeps {
  readonly campaignReminders: CampaignReminderRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface StartCampaignReminderInput {
  readonly name: string;
}

/**
 * Switch a named reminder on (US-40). Nothing is written per household: every one of them is „not
 * yet received" until ticked.
 *
 * @throws {MissingRequiredField} naming `name` if the name is blank.
 * @throws {CampaignReminderNameTooLong} if the name is longer than the counter's label allows.
 * @throws {CampaignReminderAlreadyActive} if a reminder is already switched on.
 */
export async function startCampaignReminder(
  deps: StartCampaignReminderDeps,
  input: StartCampaignReminderInput,
): Promise<CampaignReminder> {
  const name = createCampaignReminderName(input.name);
  if ((await deps.campaignReminders.findActive()) !== null) {
    throw new CampaignReminderAlreadyActive();
  }

  const when = deps.clock.now();
  const started = await deps.campaignReminders.start(name, when);
  await deps.audit.append({
    what: "campaignReminder.started",
    changedFields: ["name"],
    when,
    why: `name=${name}`,
  });
  return started;
}
