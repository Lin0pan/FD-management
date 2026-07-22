/**
 * The settings screen.
 *
 * Reads the values in force and the version history, then renders them. It contains no rules: the
 * "what is in force today" question is answered by `readCurrentSettings`, and saving goes through
 * the `saveSettings` action into `updateSettings` (tasks/prd-us-14-configure-business-rules.md
 * §US-14.4).
 */

import { listSettingsVersions } from "@/application/settings/list-settings-versions";
import { readCurrentSettings } from "@/application/settings/read-current-settings";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import type { Settings, SettingsVersion } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { settingsDeps } from "./deps";
import { SettingsForm } from "./settings-form";

/** Settings change through the form, so the page must never be served from a build-time cache. */
export const dynamic = "force-dynamic";

/** The `<input type="date">` value format. Versions are stored at midnight UTC, so read in UTC. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dates are shown to staff the German way; nobody here should have to read an ISO timestamp. */
function germanDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function VersionHistory({
  versions,
  now,
}: {
  versions: ReadonlyArray<SettingsVersion>;
  now: Date;
}): React.ReactElement {
  // The list is newest first, so the first version that has already taken effect is the one in
  // force — the same rule `resolveSettingsAt` applies, read off an ordered list.
  const inForce = versions.find((version) => version.effectiveFrom <= now)?.effectiveFrom;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{de.settings.history.heading}</h2>
      {versions.length === 0 ? (
        <p className="text-foreground/70">{de.settings.history.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <li
              key={version.effectiveFrom.toISOString()}
              data-testid="settings-version"
              className="rounded border border-foreground/15 px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {de.settings.history.effectiveFrom} {germanDate(version.effectiveFrom)}
              </span>
              {version.effectiveFrom > now ? (
                <span className="text-foreground/60"> — {de.settings.history.future}</span>
              ) : null}
              {version.effectiveFrom === inForce ? (
                <span className="text-foreground/60"> — {de.settings.history.current}</span>
              ) : null}
              <span className="block text-foreground/70">
                {de.settings.fields.quotaN}: {version.settings.quotaN} ·{" "}
                {de.settings.fields.portionsPerGrownUp}: {version.settings.portionsPerGrownUp} ·{" "}
                {de.settings.fields.portionsPerChild}: {version.settings.portionsPerChild}
              </span>
              <span className="block text-foreground/70">
                {de.settings.fields.pricePerGrownUp}:{" "}
                {formatEuros(version.settings.pricePerGrownUp)} · {de.settings.fields.pricePerChild}
                : {formatEuros(version.settings.pricePerChild)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function SettingsPage(): Promise<React.ReactElement> {
  const now = settingsDeps.clock.now();

  let current: Settings;
  try {
    current = await readCurrentSettings(settingsDeps);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
          <h1 className="text-3xl font-semibold">{de.settings.heading}</h1>
          <p className="max-w-prose">{de.settings.errors.noSettings}</p>
        </main>
      );
    }
    throw error;
  }

  const versions = await listSettingsVersions(settingsDeps);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{de.settings.heading}</h1>
        <p className="max-w-prose text-foreground/70">{de.settings.intro}</p>
      </header>
      <SettingsForm settings={current} today={isoDay(now)} />
      <VersionHistory versions={versions} now={now} />
    </main>
  );
}
