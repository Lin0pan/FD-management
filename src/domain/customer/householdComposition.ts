/**
 * Household composition — how many grown-ups and how many children live in a household.
 *
 * The counts drive the portion allowance and the price (US-07), and the Excel sheet DF is replacing
 * kept them as typed-in numbers that drifted out of date with every birthday. Here they are
 * **derived** from the birthdates on file and never stored (CLAUDE.md, "Derive, don't store"), so a
 * count that contradicts the household is not something the system can express.
 *
 * The module is pure: `today` is a parameter, never `new Date()`.
 */

import { berlinDayKey } from "../distribution/attendance";
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
 * The instant of the UTC day a **birthdate** falls on. A birthdate is a calendar day, not a moment:
 * whoever typed it meant a day, and it is stored anchored at UTC midnight. Comparing the day rather
 * than the timestamp keeps a member's status from depending on the time of day the record was
 * written.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The instant of the calendar day an evaluation moment falls on **in Europe/Berlin**, comparable
 * with {@link utcDay}.
 *
 * `today` is the one input here that is a real moment rather than a stored day: it comes from the
 * clock while somebody is standing at the counter in Germany. So the day it belongs to is the local
 * one — a member born on the 15th is a grown-up from 00:00 Berlin on the 15th, not from 01:00 or
 * 02:00 as a UTC comparison would have it (US-13.1). This is the same notion of "the day" the
 * attendance rules count in, deliberately taken from there rather than restated.
 */
function berlinDay(instant: Date): number {
  return Date.parse(`${berlinDayKey(instant)}T00:00:00.000Z`);
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
 * their 13th birthday; the day before they are still a child. The day turns over at midnight in
 * Europe/Berlin, so the counts, the portion allowance and the price follow a birthday with no staff
 * action — the reclassification is a read-time derivation, not a job (US-13).
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

  const asOf = berlinDay(today);
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

/**
 * A member's age in completed years as of `today`.
 *
 * Shares {@link composition}'s anniversary convention: the age ticks over **on** the birthday (at
 * Berlin midnight, like the grown-up split), and a
 * 29 February birthdate rolls its anniversary to 1 March in a non-leap year (§ 188 Abs. 3 BGB). The
 * customer record shows this beside each birthdate so staff read a household at a glance without
 * doing the arithmetic (tasks/prd-us-16-maintain-customer-record.md §US-16.5). It is derived on every
 * read, never stored, for the same reason the counts are.
 *
 * @throws {BirthDateInFuture} if `birthDate` lies after `today` — a negative age is a data-entry
 *   mistake, not a number worth showing.
 */
export function ageInYears(birthDate: Date, today: Date): number {
  const asOf = berlinDay(today);
  if (utcDay(birthDate) > asOf) {
    throw new BirthDateInFuture(birthDate, today);
  }

  let age = new Date(asOf).getUTCFullYear() - birthDate.getUTCFullYear();
  const anniversary = Date.UTC(
    birthDate.getUTCFullYear() + age,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
  if (anniversary > asOf) {
    age -= 1;
  }
  return age;
}
