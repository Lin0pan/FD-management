/**
 * Append a new dated version of the policy values.
 *
 * Settings are never edited in place. Each save adds a version with an effective-from date, so a
 * distribution recorded last March can still be priced with the table that applied then
 * (tasks/prd-us-14-configure-business-rules.md §US-14.2, FR-1/FR-6).
 */

import { QuotaBelowActiveCustomers, RetroactiveSettingsVersion } from "@/domain/errors";
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
  /** The day the new values take over. Not necessarily today — staff may schedule a price rise. */
  readonly effectiveFrom: Date;
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

function latestVersion(versions: ReadonlyArray<SettingsVersion>): SettingsVersion | undefined {
  let latest: SettingsVersion | undefined;
  for (const version of versions) {
    if (latest === undefined || version.effectiveFrom.getTime() > latest.effectiveFrom.getTime()) {
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
 * @throws {RetroactiveSettingsVersion} if the new version is not dated after the latest one.
 * @throws {QuotaBelowActiveCustomers} if the new quota is below the customers already registered.
 */
export async function updateSettings(
  deps: UpdateSettingsDeps,
  input: UpdateSettingsInput,
): Promise<Settings> {
  const settings = createSettings(input.settings);
  const reason = input.reason.trim();

  const latest = latestVersion(await deps.settings.listVersions());
  if (latest !== undefined && input.effectiveFrom.getTime() <= latest.effectiveFrom.getTime()) {
    throw new RetroactiveSettingsVersion(input.effectiveFrom, latest.effectiveFrom);
  }

  const activeCustomers = await deps.customers.countActive();
  if (settings.quotaN < activeCustomers) {
    throw new QuotaBelowActiveCustomers(settings.quotaN, activeCustomers);
  }

  await deps.settings.append({ effectiveFrom: input.effectiveFrom, settings });
  await deps.audit.append({
    what: SETTINGS_UPDATED,
    changedFields: changedSettingsFields(latest?.settings, settings),
    when: deps.clock.now(),
    why: reason,
  });
  return settings;
}
