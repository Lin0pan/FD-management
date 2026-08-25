/**
 * What changed between two consecutive policy versions.
 *
 * The settings screen used to restate every value on every row of its history, which made finding
 * the one that moved a matter of diffing two 136-character strings by eye — and printed only the
 * amounts and the prices, so a change to the Ausgabetag produced a row identical to its predecessor
 * in every character. A version is therefore rendered as the changes that produced it, and this is
 * where they are derived.
 *
 * Two things this deliberately does *not* do:
 *
 * - It does not reuse {@link changedSettingsFields} in `settings.ts`, and neither should replace the
 *   other. That one names fields the way an **audit entry** does, with `weekAnchor` as a single
 *   field, because that is the record `updateSettings` writes. This one names the fields the way the
 *   **form** does — the anchor's week and its colour are two controls, two labels in the dictionary
 *   and two separately readable changes.
 * - It carries no German and does not stringify. `from` and `to` keep the domain's own types, so the
 *   renderer can `switch` over {@link SettingsChange} exhaustively and format cents as euros and a
 *   weekday as a weekday, rather than receiving text it can only pass through.
 *
 * Pure: no I/O, no clock.
 */

import type { Cents } from "../money";
import { diffEggRule, type EggRuleRowChange } from "./eggs";
import type { IsoWeekday, Settings, WeekColour } from "./settings";

/** One field that differs between two versions, with the value on either side of the change. */
export type SettingsChange =
  | { readonly field: "quotaN"; readonly from: number; readonly to: number }
  | { readonly field: "weekAnchorIsoWeek"; readonly from: string; readonly to: string }
  | { readonly field: "weekAnchorColour"; readonly from: WeekColour; readonly to: WeekColour }
  | { readonly field: "distributionWeekday"; readonly from: IsoWeekday; readonly to: IsoWeekday }
  | { readonly field: "pricePerGrownUp"; readonly from: Cents; readonly to: Cents }
  | { readonly field: "pricePerChild"; readonly from: Cents; readonly to: Cents }
  | { readonly field: "priceCap"; readonly from: Cents | null; readonly to: Cents | null }
  /**
   * The one variant without `from` and `to`, deliberately: a list-valued setting's change is a set
   * of row changes, and stating it as `from → to` would print the two whole rules side by side —
   * exactly the 136-character restatement this history was rewritten to stop doing. The rows are
   * already in threshold order, so the renderer joins them and adds nothing.
   */
  | { readonly field: "eggRule"; readonly rows: ReadonlyArray<EggRuleRowChange> };

/** The name of one field a change can be reported against — the keys of `de.settings.fields`. */
export type SettingsChangeField = SettingsChange["field"];

/**
 * The fields that differ between `previous` and `next`, in the order the form states them.
 *
 * An empty list is a real answer: two saves can hold identical values, and the screen says so rather
 * than showing a version with nothing under it.
 */
export function diffSettings(previous: Settings, next: Settings): ReadonlyArray<SettingsChange> {
  const changes: SettingsChange[] = [];

  if (previous.quotaN !== next.quotaN) {
    changes.push({ field: "quotaN", from: previous.quotaN, to: next.quotaN });
  }
  if (previous.weekAnchor.isoWeek !== next.weekAnchor.isoWeek) {
    changes.push({
      field: "weekAnchorIsoWeek",
      from: previous.weekAnchor.isoWeek,
      to: next.weekAnchor.isoWeek,
    });
  }
  if (previous.weekAnchor.colour !== next.weekAnchor.colour) {
    changes.push({
      field: "weekAnchorColour",
      from: previous.weekAnchor.colour,
      to: next.weekAnchor.colour,
    });
  }
  if (previous.distributionWeekday !== next.distributionWeekday) {
    changes.push({
      field: "distributionWeekday",
      from: previous.distributionWeekday,
      to: next.distributionWeekday,
    });
  }
  if (previous.pricePerGrownUp !== next.pricePerGrownUp) {
    changes.push({
      field: "pricePerGrownUp",
      from: previous.pricePerGrownUp,
      to: next.pricePerGrownUp,
    });
  }
  if (previous.pricePerChild !== next.pricePerChild) {
    changes.push({ field: "pricePerChild", from: previous.pricePerChild, to: next.pricePerChild });
  }
  // Introducing a cap and removing one are both changes, so the comparison is over the whole of
  // `Cents | null` rather than over the amount: `null` is a configuration here, not a missing value.
  if (previous.priceCap !== next.priceCap) {
    changes.push({ field: "priceCap", from: previous.priceCap, to: next.priceCap });
  }

  // Only when something in the rule actually moved: `diffEggRule` returns an empty list for two
  // equal rules, and an entry carrying no rows would be a version reporting a change to nothing.
  const rows = diffEggRule(previous.eggRule, next.eggRule);
  if (rows.length > 0) {
    changes.push({ field: "eggRule", rows });
  }

  return changes;
}
