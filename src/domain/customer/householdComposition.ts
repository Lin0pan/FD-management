/**
 * Household composition — how many grown-ups and how many children live in a household.
 *
 * The counts drive the portion allowance and the price (US-07), and the Excel sheet FD is replacing
 * kept them as typed-in numbers that drifted out of date with every birthday. Here they are
 * **derived** from the birthdates on file and never stored (CLAUDE.md, "Derive, don't store"), so a
 * count that contradicts the household is not something the system can express.
 *
 * The module is pure: `today` is a parameter, never `new Date()`.
 */

import { BirthDateInFuture, EmptyHousehold } from "../errors";

/** The age, in years, at which a household member stops counting as a child (US-13). */
export const GROWN_UP_AGE_YEARS = 13;

/**
 * A household member as this rule sees them: a birthdate. Later stories carry names alongside it;
 * such a record stays assignable here, so widening the entity does not touch this module.
 */
export interface HouseholdMember {
  readonly birthDate: Date;
}

/** The derived split of a household. Always sums to the number of members. */
export interface HouseholdComposition {
  readonly grownUps: number;
  readonly children: number;
}

/**
 * The instant of the UTC day a date falls on. Birthdates and "today" are calendar days, not moments:
 * whoever typed a birthdate meant a day, and a distribution happens on a day. Comparing the days
 * rather than the timestamps keeps a member's status from depending on the time of day a record was
 * written.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The day a member born on `birthDate` turns {@link GROWN_UP_AGE_YEARS}.
 *
 * A 29 February birthdate has no anniversary in a non-leap year. `Date.UTC` rolls 29 February over
 * to 1 March, which is the German civil-law convention (§ 188 Abs. 3 BGB): the person comes of age
 * on 1 March, not on 28 February. Thirteen years after a leap year is never itself a leap year, so
 * this rolls over every time.
 */
function grownUpFrom(birthDate: Date): number {
  return Date.UTC(
    birthDate.getUTCFullYear() + GROWN_UP_AGE_YEARS,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
}

/**
 * Split a household into grown-ups and children as of `today`. A member counts as a grown-up **on**
 * their 13th birthday; the day before they are still a child.
 *
 * @throws {EmptyHousehold} if `members` is empty — a household with nobody in it is a data-entry
 *   mistake, and answering `{ grownUps: 0, children: 0 }` would let it through as a free household.
 * @throws {BirthDateInFuture} if any member was born after `today`.
 */
export function composition(
  members: ReadonlyArray<HouseholdMember>,
  today: Date,
): HouseholdComposition {
  if (members.length === 0) {
    throw new EmptyHousehold();
  }

  const asOf = utcDay(today);
  let grownUps = 0;
  let children = 0;

  for (const member of members) {
    if (utcDay(member.birthDate) > asOf) {
      throw new BirthDateInFuture(member.birthDate, today);
    }
    if (grownUpFrom(member.birthDate) <= asOf) {
      grownUps += 1;
    } else {
      children += 1;
    }
  }

  return { grownUps, children };
}
