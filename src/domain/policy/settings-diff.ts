/**
 * What changed between two consecutive policy versions — the settings history renders a version as
 * the changes that produced it, rather than restating every value on every row.
 *
 * Deliberately not `changedSettingsFields` in `settings.ts`, and neither replaces the other: that
 * one names fields as an **audit entry** does, with `weekAnchor` as one field, while this names them
 * as the **form** does, where the anchor's week and its colour are two controls.
 *
 * `from` and `to` keep the domain's own types and carry no German, so the renderer can `switch`
 * exhaustively and format cents as euros rather than receive text it can only pass through.
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
   * The one variant without `from` and `to`: a list-valued setting's change is a set of row changes,
   * and `from → to` would print both whole rules side by side. Rows arrive in threshold order.
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
