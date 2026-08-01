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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import type { Settings, SettingsVersion } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { SHELL } from "../shell";
import { settingsDeps } from "./deps";
import { SettingsForm } from "./settings-form";

/** Settings change through the form, so the page must never be served from a build-time cache. */
export const dynamic = "force-dynamic";

function VersionHistory({
  versions,
  now,
}: {
  versions: ReadonlyArray<SettingsVersion>;
  now: Date;
}): React.ReactElement {
  // The list is newest first, so the first version already recorded is the one in force — the same
  // rule `resolveSettingsAt` applies, read off an ordered list. A change applies immediately, so
  // that is normally the first entry; a row stamped in the future can only come from a clock skew
  // or a hand-edited database, and the label must not then contradict the form above it.
  const inForce = versions.find((version) => version.recordedAt <= now);

  // Only the frame is converted here. The rows keep every `Feld: Wert` string — label, colon and
  // euro sign — because that is how `settings.spec.ts` asserts a version, and the table with one
  // column per setting that `docs/ui_redesign_einstellungen.md` §4.2e asks for is a content change
  // that has to edit the spec deliberately (§8, step 3).
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{de.settings.history.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {versions.length === 0 ? (
          <p className="text-muted-foreground">{de.settings.history.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {versions.map((version, index) => (
              <li
                // Two versions can share an instant, so the position disambiguates the key.
                key={`${version.recordedAt.toISOString()}-${index}`}
                data-testid="settings-version"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {de.settings.history.recordedAt} {germanDate(version.recordedAt)}
                </span>
                {version === inForce ? (
                  <span className="text-muted-foreground"> — {de.settings.history.current}</span>
                ) : null}
                <span className="block text-muted-foreground">
                  {de.settings.fields.quotaN}: {version.settings.quotaN} ·{" "}
                  {de.settings.fields.portionsPerGrownUp}: {version.settings.portionsPerGrownUp} ·{" "}
                  {de.settings.fields.portionsPerChild}: {version.settings.portionsPerChild}
                </span>
                <span className="block text-muted-foreground">
                  {de.settings.fields.pricePerGrownUp}:{" "}
                  {formatEuros(version.settings.pricePerGrownUp)} ·{" "}
                  {de.settings.fields.pricePerChild}: {formatEuros(version.settings.pricePerChild)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
        // Still a dead end — the form is not rendered here, and giving this state the form so it
        // can bootstrap itself is §4.2f, a change to what the screen does rather than how it looks.
        <main className={SHELL}>
          <h1 className="text-3xl font-semibold tracking-tight">{de.settings.heading}</h1>
          <p className="max-w-prose text-muted-foreground">{de.settings.errors.noSettings}</p>
        </main>
      );
    }
    throw error;
  }

  const versions = await listSettingsVersions(settingsDeps);

  return (
    <main className={SHELL}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{de.settings.heading}</h1>
        <p className="max-w-prose text-muted-foreground">{de.settings.intro}</p>
      </header>
      <SettingsForm settings={current} />
      <VersionHistory versions={versions} now={now} />
    </main>
  );
}
