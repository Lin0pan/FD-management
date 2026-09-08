/**
 * The half of the distribution cycle a customer number falls in. RED households collect one week,
 * BLUE the next, so the two halves have to stay roughly equal in size — a lopsided split overwhelms
 * the volunteers one week and wastes food the other.
 *
 * `Group` and `WeekColour` (`../policy/settings`) share their values but are deliberately different
 * types: a week's colour follows from the anchor in settings, a group from the number the household
 * holds. Aliasing them would make one editable through the other.
 */

/** The two halves of the distribution cycle a customer number can fall in. */
export type Group = "RED" | "BLUE";

/** How many of a set of customer numbers fall in each group. */
export interface GroupCounts {
  readonly red: number;
  readonly blue: number;
}

/**
 * The group a customer number belongs to: **even is BLUE, odd is RED**.
 *
 * The only place parity is read as a group, and deliberately not configurable — a second recording
 * of it could disagree with the number (ADR-017, US-31). A card's group is the parity of the slot it
 * was printed under, not of the one its holder has today (US-30, ADR-016).
 */
export function groupOf(customerNumber: number): Group {
  return customerNumber % 2 === 0 ? "BLUE" : "RED";
}

/** The members of `numbers` that belong to `group`, in the order they were given. */
export function inGroup(numbers: ReadonlyArray<number>, group: Group): ReadonlyArray<number> {
  return numbers.filter((customerNumber) => groupOf(customerNumber) === group);
}

/**
 * How many of the given customer numbers fall in each group.
 *
 * Arithmetic over `takenActiveNumbers`, not a query: the database cannot know parity better than
 * this can, and a `groupCounts()` column would be the second recording US-31 removed.
 */
export function countByGroup(customerNumbers: ReadonlyArray<number>): GroupCounts {
  return {
    red: inGroup(customerNumbers, "RED").length,
    blue: inGroup(customerNumbers, "BLUE").length,
  };
}

/**
 * The group a new household should join: the smaller one **that still has a free number**.
 *
 * A group can be full while the register is not — 120 even slots under a quota of 240 — and a quota
 * that was lowered (US-14) is exactly where the smaller group is the full one. `null` means neither
 * has a free number, which is the register being full.
 *
 * A tie always answers `RED`, never a coin flip: a random suggestion would make registration
 * irreproducible, and staff could not tell a deliberate assignment from a shuffled one.
 *
 * This recommendation is the only pressure the software applies — no warning when the groups drift
 * apart, and nothing suggesting a household be moved.
 */
export function suggestGroup(
  freeNumbers: ReadonlyArray<number>,
  counts: GroupCounts,
): Group | null {
  const redIsFree = freeNumbers.some((customerNumber) => groupOf(customerNumber) === "RED");
  const blueIsFree = freeNumbers.some((customerNumber) => groupOf(customerNumber) === "BLUE");
  if (!redIsFree && !blueIsFree) {
    return null;
  }
  if (!blueIsFree) {
    return "RED";
  }
  if (!redIsFree) {
    return "BLUE";
  }
  return counts.blue < counts.red ? "BLUE" : "RED";
}

/** The two groups, for offering both of them in a form. */
export const GROUPS: ReadonlyArray<Group> = ["RED", "BLUE"];
