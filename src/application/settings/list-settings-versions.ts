/**
 * List every policy version ever written, newest first.
 *
 * The settings screen shows the current values for editing and the superseded ones read-only, so
 * staff can see when a price last changed and what it was (tasks/prd-us-14-configure-business-
 * rules.md §US-14.4). Versions are never edited or deleted, so this is a pure history.
 */

import type { SettingsVersion } from "@/domain/policy/settings";
import type { SettingsRepository } from "../ports";

export interface ListSettingsVersionsDeps {
  readonly settings: SettingsRepository;
}

/**
 * Every version, newest first. The order is imposed here rather than assumed of the repository,
 * which is free to return rows however its query happens to.
 */
export async function listSettingsVersions(
  deps: ListSettingsVersionsDeps,
): Promise<SettingsVersion[]> {
  const versions = await deps.settings.listVersions();
  return versions.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
}
