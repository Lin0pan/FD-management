/**
 * The half of the distribution cycle a customer number belongs to.
 *
 * DF distributes on a two-week cycle: RED households come one week, BLUE the next, so roughly half
 * the register turns up on any given distribution day. The two halves therefore have to stay
 * roughly equal in size — a lopsided split means one week overwhelms the volunteers and the other
 * wastes the food that was collected for it.
 *
 * The values match `WeekColour` in `../policy/settings` by design: a RED household is expected in a
 * RED week. They are deliberately *not* the same type, because the two answer different questions —
 * a week's colour follows from the anchor in settings, while a group follows from the number the
 * household holds. Aliasing them would make one editable through the other.
 *
 * This module is pure: it does no I/O and never reads the wall clock.
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
 * A group is **not a property of a household**. It is DF's own rule, older than the software and
 * the way the paper register has always worked — the number alone says which week that household
 * collects. The software used to record the two separately, and the very reason they were separate
 * values is now the reason they must not be: two answers to one question can disagree, and nothing
 * would notice when they did (US-31).
 *
 * So this is the only place parity is ever read as a group. Everything that shows a household's
 * group calls it with the number that household holds, and everything that shows a *card's* group
 * calls it with the slot that card was printed under (US-30, ADR-016).
 *
 * The mapping is deliberately **not configurable**. DF see no reason it would ever flip, and a
 * setting would be a second place for it to be wrong — which is the fault this rule exists to
 * remove, put back one layer down.
 */
export function groupOf(customerNumber: number): Group {
  return customerNumber % 2 === 0 ? "BLUE" : "RED";
}

/**
 * The members of `numbers` that belong to `group`, in the order they were given.
 *
 * Both screens and both allocation paths ask "which of these numbers are this group's", so it is
 * spelled out here once rather than as a parity test at each of them.
 */
export function inGroup(numbers: ReadonlyArray<number>, group: Group): ReadonlyArray<number> {
  return numbers.filter((customerNumber) => groupOf(customerNumber) === group);
}

/**
 * How many of the given customer numbers fall in each group.
 *
 * This is arithmetic, not persistence, which is why it replaced a `groupCounts()` query: the
 * numbers held by active households are already something the register answers
 * (`takenActiveNumbers`), and counting them by parity adds nothing the database could know better.
 * Deriving a figure the database used to count is this whole change in miniature.
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
 * Balance is the goal — left alone, a register would fill up on one parity and one week would
 * overwhelm the volunteers — but a group with nothing to offer is never recommended. A group can be
 * full while the register is not (there are only 120 even slots below a quota of 240), and a quota
 * that was lowered (US-14) is exactly the case where the *smaller* group is the full one.
 *
 * On a tie the answer is always `RED`, never a coin flip. The choice is arbitrary but it has to be
 * *fixed*: a random suggestion would make registration irreproducible — the same register would
 * yield a different customer under test than in production — and staff would have no way to tell a
 * deliberate assignment from a shuffled one.
 *
 * `null` means neither group has a free number, which is the register being full: a state the
 * registration screen already renders on its own.
 *
 * The recommendation is the **only** pressure the software applies. There is no warning when the
 * groups drift apart, no threshold and nothing that suggests moving a household — DF read the
 * balance off the figures already on screen.
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
