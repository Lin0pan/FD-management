/**
 * Read the policy values in force today — the single seam every feature reaches configuration
 * through, rather than reading rows itself
 * (`tasks/prd-us-14-configure-business-rules.md` §US-14.2).
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
 * @throws {NoSettingsInForce} if no version has taken effect yet — a setup failure, not a reason to
 * invent defaults.
 */
export async function readCurrentSettings(deps: ReadCurrentSettingsDeps): Promise<Settings> {
  const versions = await deps.settings.listVersions();
  return resolveSettingsAt(versions, deps.clock.now());
}
