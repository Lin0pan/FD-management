/**
 * The egg allowance: how many eggs a household of a given size receives (US-28). A policy value like
 * any other, but list-valued rather than a single number, which is why it has a module of its own.
 *
 * Nothing beyond the two rules below is judged: an egg count need not be a multiple of six, a
 * threshold of one person is allowed, and a row awarding no eggs at all is allowed.
 */

import { DuplicateEggThreshold, EggsNotIncreasing } from "../errors";
import { requireInteger } from "./require-integer";

/** One step of the staircase: from `minPersons` in the household, `eggs` eggs. */
export interface EggRuleRow {
  readonly minPersons: number;
  readonly eggs: number;
}

/**
 * A validated egg rule, always sorted by `minPersons` ascending. Only {@link createEggRule} makes
 * one, so readers may rely on the order and the staircase. An empty rule means no eggs for anyone.
 */
export type EggRule = ReadonlyArray<EggRuleRow>;

/**
 * Validate a set of typed rows and return them as an {@link EggRule}. Sorting is part of constructing
 * the value, not something a caller does first — staff type rows in whatever order they think of.
 *
 * @throws {InvalidSettings} naming `eggRule.<index>.minPersons` or `eggRule.<index>.eggs` — the
 *   index of the row as it was *typed*, so the form points at the row on screen rather than at the
 *   one it sorts to.
 * @throws {DuplicateEggThreshold} if two rows name the same household size.
 * @throws {EggsNotIncreasing} if a larger household is awarded no more eggs than a smaller one.
 */
export function createEggRule(rows: ReadonlyArray<EggRuleRow>): EggRule {
  rows.forEach((row, index) => {
    requireInteger(`eggRule.${index}.minPersons`, row.minPersons, 1);
    requireInteger(`eggRule.${index}.eggs`, row.eggs, 0);
  });

  const sorted = [...rows].sort((a, b) => a.minPersons - b.minPersons);

  // Neighbours only: the list is sorted, so a strict increase between every pair is a strict
  // increase throughout.
  for (let index = 1; index < sorted.length; index += 1) {
    const lower = sorted[index - 1];
    const row = sorted[index];
    if (row.minPersons === lower.minPersons) {
      throw new DuplicateEggThreshold(row.minPersons);
    }
    if (row.eggs <= lower.eggs) {
      throw new EggsNotIncreasing(row.minPersons, row.eggs, lower.minPersons, lower.eggs);
    }
  }

  return sorted.map((row) => ({ minPersons: row.minPersons, eggs: row.eggs }));
}

/**
 * How many eggs a household of `persons` receives: the highest threshold it reaches, 0 if none.
 *
 * `persons` counts **heads, not ages** — an infant counts — so a 13th birthday leaves the egg count
 * where it was even though it moves the counts and the price (US-13).
 *
 * Takes an already-validated {@link EggRule} and neither sorts nor checks: the type is the invariant.
 */
export function eggsFor(rule: EggRule, persons: number): number {
  let eggs = 0;
  for (const row of rule) {
    if (persons >= row.minPersons) eggs = row.eggs;
  }
  return eggs;
}

/**
 * One row's fate between two versions of the rule. A `changed` row keeps only `from` and `to`,
 * because the threshold is what identifies the row — retyping „ab 5“ as „ab 6“ is a removal and an
 * addition, which is what it is: the household of five stopped receiving anything.
 */
export type EggRuleRowChange =
  | { readonly kind: "added"; readonly minPersons: number; readonly eggs: number }
  | { readonly kind: "removed"; readonly minPersons: number; readonly eggs: number }
  | {
      readonly kind: "changed";
      readonly minPersons: number;
      readonly from: number;
      readonly to: number;
    };

/**
 * What changed between two egg rules, in threshold order. Rows are matched **by threshold**, never by
 * position — otherwise removing the lowest row would read as a change to every row below it. An
 * empty list means the two are the same rule; the order they were typed in is not part of the value
 * (FR-6).
 */
export function diffEggRule(previous: EggRule, next: EggRule): ReadonlyArray<EggRuleRowChange> {
  const before = new Map(previous.map((row) => [row.minPersons, row.eggs]));
  const after = new Map(next.map((row) => [row.minPersons, row.eggs]));

  const thresholds = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);

  const changes: EggRuleRowChange[] = [];
  for (const minPersons of thresholds) {
    const from = before.get(minPersons);
    const to = after.get(minPersons);
    if (from === undefined && to !== undefined) {
      changes.push({ kind: "added", minPersons, eggs: to });
    } else if (from !== undefined && to === undefined) {
      changes.push({ kind: "removed", minPersons, eggs: from });
    } else if (from !== undefined && to !== undefined && from !== to) {
      changes.push({ kind: "changed", minPersons, from, to });
    }
  }
  return changes;
}
