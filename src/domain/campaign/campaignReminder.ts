/**
 * The campaign reminder (US-40): one freely named checkbox per household that DF switch on for a
 * campaign every household gets once, such as a Christmas bag. A household with no tick has not yet
 * received it, so nothing here — or anywhere — is written per household when one is switched on.
 */

import type { CustomerStatus } from "../customer/customer";
import { CampaignReminderNameTooLong, MissingRequiredField } from "../errors";

/** It is a checkbox label at the counter, which a longer name would wrap. */
export const CAMPAIGN_REMINDER_NAME_MAX_LENGTH = 40;

/**
 * A validated, trimmed campaign reminder name. Only {@link createCampaignReminderName} makes one, the
 * way only `createCertificateTypeList` makes a `CertificateTypeList`.
 */
export type CampaignReminderName = string;

/**
 * @throws {MissingRequiredField} naming `name` if nothing but spaces was typed.
 * @throws {CampaignReminderNameTooLong} above {@link CAMPAIGN_REMINDER_NAME_MAX_LENGTH} characters.
 */
export function createCampaignReminderName(raw: string): CampaignReminderName {
  const name = raw.trim();
  if (name === "") {
    throw new MissingRequiredField("name");
  }
  if (name.length > CAMPAIGN_REMINDER_NAME_MAX_LENGTH) {
    throw new CampaignReminderNameTooLong(name.length, CAMPAIGN_REMINDER_NAME_MAX_LENGTH);
  }
  return name;
}

export interface CampaignProgress {
  readonly received: number;
  readonly total: number;
}

/**
 * How many of the households still on the register have been ticked. A tick left on a household
 * archived since counts in neither figure, so `received` can never exceed `total`.
 */
export function campaignProgress(
  households: ReadonlyArray<{ readonly id: number; readonly status: CustomerStatus }>,
  receivedIds: ReadonlySet<number>,
): CampaignProgress {
  const onRegister = households.filter((household) => household.status !== "ARCHIVED");
  return {
    received: onRegister.filter((household) => receivedIds.has(household.id)).length,
    total: onRegister.length,
  };
}
