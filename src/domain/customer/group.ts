/**
 * The balancing group a customer belongs to.
 *
 * FD distributes on a two-week cycle: RED households come one week, BLUE the next, so roughly half
 * the register turns up on any given distribution day. The two groups therefore have to stay
 * roughly equal in size — a lopsided split means one week overwhelms the volunteers and the other
 * wastes the food that was collected for it.
 *
 * The values match `WeekColour` in `../policy/settings` by design: a RED customer is expected
 * in a RED week. They are deliberately *not* the same type, because the two answer different
 * questions — a week's colour is a property of the calendar and follows from the anchor in
 * settings, while a group is a property of a customer that FD may override by hand (a household
 * that shares a lift with a neighbour). Aliasing them would make one editable through the other.
 *
 * This module is pure: it does no I/O and never reads the wall clock.
 */

/** The two halves of the distribution cycle a customer can be assigned to. */
export type Group = "RED" | "BLUE";

/** How many **active** customers each group currently holds. */
export interface GroupCounts {
  readonly red: number;
  readonly blue: number;
}

/**
 * The group a new customer should join to keep the cycle balanced: whichever holds fewer active
 * customers. Archived customers do not turn up to a distribution, so they do not count.
 *
 * On a tie the answer is always `RED`, never a coin flip. The choice is arbitrary but it has to be
 * *fixed*: a random suggestion would make registration irreproducible — the same register would
 * yield a different customer under test than in production — and staff would have no way to tell a
 * deliberate assignment from a shuffled one.
 *
 * The result is **advice**. The caller may store a different group, and this function has no
 * authority over what is persisted (US-01.4).
 */
export function suggestGroup(counts: GroupCounts): Group {
  return counts.blue < counts.red ? "BLUE" : "RED";
}
