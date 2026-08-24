/**
 * The settings screen.
 *
 * Reads the values in force and the version history, then renders them. It contains no rules: the
 * "what is in force today" question is answered by `readCurrentSettings`, and saving goes through
 * the `saveSettings` action into `updateSettings` (tasks/prd-us-14-configure-business-rules.md
 * §US-14.4).
 */

import {
  listSettingsVersions,
  type SettingsVersionEntry,
} from "@/application/settings/list-settings-versions";
import { readCurrentSettings } from "@/application/settings/read-current-settings";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DomainError } from "@/domain/errors";
import { type Cents, formatEuros } from "@/domain/money";
import type { EggRuleRowChange } from "@/domain/policy/eggs";
import type { Settings } from "@/domain/policy/settings";
import type { SettingsChange } from "@/domain/policy/settings-diff";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { SHELL } from "../shell";
import { settingsDeps } from "./deps";
import { SettingsForm } from "./settings-form";

/** Settings change through the form, so the page must never be served from a build-time cache. */
export const dynamic = "force-dynamic";

/**
 * One changed field in the words the form uses for it.
 *
 * The switch is exhaustive over `SettingsChange`, which is why the domain hands back field names and
 * typed values instead of strings: cents become euros, a colour and a weekday become German, and a
 * field added to `Settings` without a line here fails to compile rather than printing `[object
 * Object]` into the history.
 */
function describeChange(change: SettingsChange): string {
  const { change: sentence } = de.settings.history;
  switch (change.field) {
    case "quotaN":
      return sentence(de.settings.fields.quotaN, String(change.from), String(change.to));
    case "weekAnchorIsoWeek":
      return sentence(de.settings.fields.weekAnchorIsoWeek, change.from, change.to);
    case "weekAnchorColour":
      return sentence(
        de.settings.fields.weekAnchorColour,
        de.settings.colours[change.from],
        de.settings.colours[change.to],
      );
    case "distributionWeekday":
      return sentence(
        de.settings.fields.distributionWeekday,
        de.settings.weekdays[change.from],
        de.settings.weekdays[change.to],
      );
    case "pricePerGrownUp":
    case "pricePerChild":
      return sentence(
        de.settings.fields[change.field],
        formatEuros(change.from),
        formatEuros(change.to),
      );
    case "priceCap":
      return sentence(
        de.settings.fields.priceCap,
        describeCap(change.from),
        describeCap(change.to),
      );
    case "eggRule":
      // The one change without a `from` and a `to`: a rule is a list, and stating it as one value
      // arrowing into another would print both rules in full — the restatement this history was
      // rewritten to stop doing. The rows arrive in threshold order and are joined as they are.
      return de.settings.history.rowChanges(
        de.settings.fields.eggRule,
        change.rows.map(describeEggRuleRow),
      );
  }
}

/** One row of an egg-rule change, in the words of the kind of change it is. */
function describeEggRuleRow(row: EggRuleRowChange): string {
  const words = de.settings.eggs;
  switch (row.kind) {
    case "added":
      return words.rowAdded(row.minPersons, row.eggs);
    case "removed":
      return words.rowRemoved(row.minPersons, row.eggs);
    case "changed":
      return words.rowChanged(row.minPersons, row.from, row.to);
  }
}

/**
 * One side of a cap change: the amount, or the words for there not being one.
 *
 * Branching on `null` before formatting is the whole point — `formatEuros(0)` is `0,00 €`, and a
 * missing branch would print a cap of nothing (free for everyone) where DF had removed the cap.
 */
function describeCap(cap: Cents | null): string {
  return cap === null ? de.settings.prices.noCap : formatEuros(cap);
}

/** All seven values, for the one version that is worth reading in full: the one in force. */
function FullValues({ settings }: { settings: Settings }): React.ReactElement {
  return (
    <>
      <span className="block text-muted-foreground">
        {de.settings.fields.quotaN}: {settings.quotaN}
      </span>
      <span className="block text-muted-foreground">
        {de.settings.fields.pricePerGrownUp}: {formatEuros(settings.pricePerGrownUp)} ·{" "}
        {de.settings.fields.pricePerChild}: {formatEuros(settings.pricePerChild)} ·{" "}
        {/* Through the same `describeCap` the history uses, so „kein Maximalpreis“ is one phrase in
          one place and a version without a cap cannot read as a cap of 0,00 €. */}
        {de.settings.fields.priceCap}: {describeCap(settings.priceCap)}
      </span>
      {/* The three settings the old history never printed at all, which is how a changed Ausgabetag
        managed to produce a row identical to its predecessor in every character (§3.6). */}
      <span className="block text-muted-foreground">
        {de.settings.fields.weekAnchorIsoWeek}: {settings.weekAnchor.isoWeek} ·{" "}
        {de.settings.fields.weekAnchorColour}: {de.settings.colours[settings.weekAnchor.colour]} ·{" "}
        {de.settings.fields.distributionWeekday}:{" "}
        {de.settings.weekdays[settings.distributionWeekday]}
      </span>
    </>
  );
}

function VersionEntry({
  entry,
  inForce,
}: {
  entry: SettingsVersionEntry;
  inForce: boolean;
}): React.ReactElement {
  const words = de.settings.history;
  const date = germanDate(entry.version.recordedAt);

  // "Geändert am" would be a lie on the oldest version: nothing preceded it to change.
  const stamp = entry.kind === "initial" ? date : `${words.recordedAt} ${date}`;

  if (inForce) {
    return (
      <li data-testid="settings-version" className="flex flex-col gap-0.5 py-2 text-sm">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {stamp}
          <Badge data-testid="settings-version-current">{words.current}</Badge>
        </span>
        <FullValues settings={entry.version.settings} />
      </li>
    );
  }

  // Everything else is a log line: the date and what moved, on **one** line. Forty versions of two
  // lines each would still be three screens, and the length was half of what was wrong with the old
  // list — a diff that has to be scrolled has only fixed the other half.
  return (
    <li
      data-testid="settings-version"
      className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm"
    >
      <span className="font-medium whitespace-nowrap">{stamp}</span>
      <span className="text-muted-foreground">
        {entry.kind === "initial"
          ? words.initial
          : entry.changes.length === 0
            ? // Two identical saves are possible, and a version with nothing beside it would read as
              // a rendering fault. The record says so instead.
              words.noChange
            : entry.changes.map(describeChange).join(" · ")}
      </span>
    </li>
  );
}

/**
 * The history: one line per version stating only what moved, behind a fold that starts closed.
 *
 * It used to restate all 136 characters of every version so that one of them could change — 41
 * versions were 4.9 screens of near-identical grey paragraphs, and two neighbouring rows differed at
 * exactly one character index. A diff answers "what
 * changed" in one line, which is why this supersedes §4.2e's table of eight columns: a column still
 * asks the reader to compare cells down it. The fold is the same `<details>` the hand-out history on
 * the customer record uses, for the same reason — this is consulted after a disagreement about a
 * price, not during the work the rest of the screen is for.
 */
function VersionHistory({
  entries,
  now,
}: {
  entries: ReadonlyArray<SettingsVersionEntry>;
  now: Date;
}): React.ReactElement {
  const words = de.settings.history;

  // The list is newest first, so the first version already recorded is the one in force — the same
  // rule `resolveSettingsAt` applies, read off an ordered list. A change applies immediately, so
  // that is normally the first entry; a row stamped in the future can only come from a clock skew
  // or a hand-edited database, and the label must not then contradict the form above it.
  const inForce = entries.find((entry) => entry.version.recordedAt <= now);

  // What the summary can answer with the fold shut: how much is in here, and when it last moved.
  // A lone version was never changed, so it is dated as what it is.
  const newest = entries.at(0);
  const stamp =
    newest === undefined
      ? undefined
      : entries.length === 1
        ? words.created(germanDate(newest.version.recordedAt))
        : words.lastChange(germanDate(newest.version.recordedAt));

  return (
    <Card>
      <details>
        <summary
          data-testid="settings-history-open"
          className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        >
          <CardHeader>
            <CardTitle>
              <h2>{words.heading}</h2>
            </CardTitle>
            <CardDescription>{words.disclosure}</CardDescription>
            {/* The same slot, class and position as `history-count` on the customer record, and
              stated at zero in words for the same reason: a count that failed to load must not be
              able to pass for an empty history. */}
            <CardAction
              data-testid="settings-history-count"
              className="text-sm text-muted-foreground"
            >
              {words.count(entries.length)}
              {stamp === undefined ? null : ` · ${stamp}`}
            </CardAction>
          </CardHeader>
        </summary>
        <CardContent className="mt-6">
          {entries.length === 0 ? (
            <p className="text-muted-foreground">{words.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {entries.map((entry, index) => (
                <VersionEntry
                  // Two versions can share an instant, so the position disambiguates the key.
                  key={`${entry.version.recordedAt.toISOString()}-${index}`}
                  entry={entry}
                  inForce={entry === inForce}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </details>
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

  const history = await listSettingsVersions(settingsDeps);

  return (
    <main className={SHELL}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{de.settings.heading}</h1>
        <p className="max-w-prose text-muted-foreground">{de.settings.intro}</p>
      </header>
      <SettingsForm settings={current} />
      <VersionHistory entries={history} now={now} />
    </main>
  );
}
