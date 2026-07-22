/**
 * Read the policy values in force today.
 *
 * This is the single seam every other feature uses to reach configuration: the counter screen, the
 * price calculation and the quota check all resolve settings through here rather than reading rows
 * themselves (tasks/prd-us-14-configure-business-rules.md §US-14.2).
 */

import { resolveSettingsAt, type Settings } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";

export interface ReadCurrentSettingsDeps {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/**
 * The settings in force at the clock's "now".
 *
 * @throws {NoSettingsInForce} if no version has taken effect yet — a database that was never
 * seeded is a setup failure, not a reason to invent defaults.
 */
export async function readCurrentSettings(deps: ReadCurrentSettingsDeps): Promise<Settings> {
  const versions = await deps.settings.listVersions();
  return resolveSettingsAt(versions, deps.clock.now());
}
