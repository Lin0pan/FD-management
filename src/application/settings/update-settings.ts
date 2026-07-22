/**
 * Append a new version of the policy values, in force from the moment it is saved.
 *
 * Settings are never edited in place: each save adds a version stamped with the clock, so a
 * distribution recorded last March can still be priced with the values that applied then
 * (tasks/prd-us-14-configure-business-rules.md §US-14.2, FR-1). Staff do not date the change —
 * they adjust the numbers when reality changes, and it applies at once.
 */

import { QuotaBelowActiveCustomers } from "@/domain/errors";
import {
  changedSettingsFields,
  createSettings,
  type Settings,
  type SettingsInput,
  type SettingsVersion,
} from "@/domain/policy/settings";
import type { AuditLog, Clock, CustomerCounter, SettingsRepository } from "../ports";

/** The audit event name every settings edit is recorded under. */
const SETTINGS_UPDATED = "settings.updated";

export interface UpdateSettingsDeps {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly customers: CustomerCounter;
  readonly audit: AuditLog;
}

export interface UpdateSettingsInput {
  readonly settings: SettingsInput;
  /**
   * Why the change was made, if staff gave a reason; it becomes the audit entry's *why*.
   *
   * Optional on purpose: most settings edits are self-explanatory from the changed fields, and
   * demanding a sentence for every one of them buys invented text rather than accountability. The
   * state changes that genuinely need a *why* — a block, an archiving — still require one.
   */
  readonly reason: string;
}

/**
 * The version currently in force — what the new one is compared against to name the changed fields.
 * Ties go to the later element, matching `resolveSettingsAt`.
 */
function latestVersion(versions: ReadonlyArray<SettingsVersion>): SettingsVersion | undefined {
  let latest: SettingsVersion | undefined;
  for (const version of versions) {
    if (latest === undefined || version.recordedAt.getTime() >= latest.recordedAt.getTime()) {
      latest = version;
    }
  }
  return latest;
}

/**
 * Validate and append a new settings version, then record the change in the audit log.
 *
 * Nothing is written unless every check passes.
 *
 * @throws {InvalidSettings} if a policy value breaks an invariant.
 * @throws {QuotaBelowActiveCustomers} if the new quota is below the customers already registered.
 */
export async function updateSettings(
  deps: UpdateSettingsDeps,
  input: UpdateSettingsInput,
): Promise<Settings> {
  const settings = createSettings(input.settings);
  const reason = input.reason.trim();

  const latest = latestVersion(await deps.settings.listVersions());

  const activeCustomers = await deps.customers.countActive();
  if (settings.quotaN < activeCustomers) {
    throw new QuotaBelowActiveCustomers(settings.quotaN, activeCustomers);
  }

  // One read of the clock for both writes: the instant the values took over and the instant the
  // audit entry records must be the same, or the log would contradict the history.
  const now = deps.clock.now();
  await deps.settings.append({ recordedAt: now, settings });
  await deps.audit.append({
    what: SETTINGS_UPDATED,
    changedFields: changedSettingsFields(latest?.settings, settings),
    when: now,
    why: reason,
  });
  return settings;
}
