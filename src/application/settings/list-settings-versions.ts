/**
 * Every policy version ever written, newest first, each with the changes that produced it
 * (`tasks/prd-us-14-configure-business-rules.md` §US-14.4).
 *
 * What a reader wants from a superseded version is *what moved*, not the seven values that did not,
 * so each is paired with its predecessor here rather than in the page.
 */

import { diffSettings, type SettingsChange } from "@/domain/policy/settings-diff";
import type { SettingsVersion } from "@/domain/policy/settings";
import type { SettingsRepository } from "../ports";

/**
 * One version as the history reads it. A diff against *nothing* — where the configuration began — is
 * not the same claim as a diff that *found* nothing, so the type says which and the screen need not
 * guess from an empty array.
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

/** Newest first, imposed here — the repository is free to return rows in any order. */
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
