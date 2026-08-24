/**
 * The egg allowance: how many eggs a household receives, and the rule that decides it.
 *
 * Alongside the food, DF hand every household a quantity of eggs (US-28). Eggs are countable, so a
 * stated number is a number a staff member can actually hand over, and how many depends on how
 * large the household is. The rule is DF's own and lives in the settings like every other policy
 * value — a list of rows rather than a single number, which is why it gets a module of its own.
 *
 * This module is pure: it does no I/O, never reads the wall clock, and judges nothing beyond the
 * two rules below. An egg count need not be a multiple of six, a threshold of one person is
 * allowed, and a row awarding no eggs at all is allowed.
 */

import { DuplicateEggThreshold, EggsNotIncreasing } from "../errors";
import { requireInteger } from "./require-integer";

/** One step of the staircase: from `minPersons` in the household, `eggs` eggs. */
export interface EggRuleRow {
  readonly minPersons: number;
  readonly eggs: number;
}

/**
 * A validated egg rule, always sorted by `minPersons` ascending.
 *
 * Only {@link createEggRule} makes one, so every reader may rely on the order and on the staircase
 * holding. An empty rule is a legitimate one and means no eggs for anyone.
 */
export type EggRule = ReadonlyArray<EggRuleRow>;

/**
 * Validate a set of typed rows and return them as an {@link EggRule}.
 *
 * Sorting is part of constructing the value rather than something a caller does first: staff type
 * the rows in whatever order they think of them, and the software checks and displays them in one
 * order of its own.
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

  // Each row is checked against its immediate predecessor only. The list is sorted, so a strict
  // increase between every pair of neighbours is a strict increase throughout — there is nothing a
  // comparison against the rows further down would catch.
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
 * How many eggs a household of `persons` receives: the `eggs` of the highest threshold it reaches,
 * and 0 when it reaches none.
 *
 * `persons` is every member of the household on file, whatever their age — an infant counts, so two
 * grown-ups and one baby is three persons. Because the rule counts heads and not ages, a member's
 * 13th birthday leaves the egg count where it was, even though it moves the grown-up and children
 * counts and the price (US-13). The count moves only when somebody joins or leaves.
 *
 * Takes an already-validated {@link EggRule}, so it neither sorts nor checks anything: the type is
 * the invariant. A defensive re-sort here would be a second answer to a question `createEggRule`
 * has already settled.
 */
export function eggsFor(rule: EggRule, persons: number): number {
  let eggs = 0;
  for (const row of rule) {
    if (persons >= row.minPersons) eggs = row.eggs;
  }
  return eggs;
}

/**
 * One row's fate between two versions of the rule: it appeared, it went away, or its egg count
 * moved.
 *
 * A `changed` row keeps `from` and `to` because that is the whole of what moved — a threshold
 * cannot change, since the threshold is what identifies the row. Retyping „ab 5“ as „ab 6“ is a row
 * removed and a row added, which is what it is: the household of five stopped receiving anything.
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
 * What changed between two egg rules, row by row and in threshold order.
 *
 * Rows are matched **by threshold**, never by position: a rule is a set of steps identified by the
 * household size they start at, and removing the lowest row would otherwise read as a change to
 * every row below it. An unchanged row is not reported, so an empty list means the two rules are the
 * same rule — the order they were typed in is not part of the value (FR-6).
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
