/**
 * List every policy version ever written, newest first, each with the changes that produced it.
 *
 * The settings screen shows the current values for editing and the superseded ones read-only, so
 * staff can see when a price last changed and what it was (tasks/prd-us-14-configure-business-
 * rules.md §US-14.4). Versions are never edited or deleted, so this is a pure history.
 *
 * A version means little on its own — read as a list, what a reader wants from a superseded one is
 * *what moved*, not the seven values that did not. Pairing each version with its predecessor is
 * derivation, so it happens here rather than in the page.
 */

import { diffSettings, type SettingsChange } from "@/domain/policy/settings-diff";
import type { SettingsVersion } from "@/domain/policy/settings";
import type { SettingsRepository } from "../ports";

/**
 * One version as the history reads it.
 *
 * The oldest version has no predecessor, and a diff against nothing is not the same claim as a diff
 * that found nothing: the first is where the configuration began, the second is a save that changed
 * no value. Saying which in the type keeps the screen from having to guess from an empty array.
 */
export type SettingsVersionEntry =
  | { readonly kind: "initial"; readonly version: SettingsVersion }
  | {
      readonly kind: "revision";
      readonly version: SettingsVersion;
      readonly changes: ReadonlyArray<SettingsChange>;
    };

export interface ListSettingsVersionsDeps {
  readonly settings: SettingsRepository;
}

/**
 * Every version, newest first. The order is imposed here rather than assumed of the repository,
 * which is free to return rows however its query happens to.
 */
export async function listSettingsVersions(
  deps: ListSettingsVersionsDeps,
): Promise<ReadonlyArray<SettingsVersionEntry>> {
  const versions = await deps.settings.listVersions();
  const newestFirst = versions.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

  return newestFirst.map((version, index) => {
    // Newest first, so the version a change was made *from* is the next one down the list.
    const previous = newestFirst[index + 1];
    if (previous === undefined) {
      return { kind: "initial", version };
    }
    return {
      kind: "revision",
      version,
      changes: diffSettings(previous.settings, version.settings),
    };
  });
}
