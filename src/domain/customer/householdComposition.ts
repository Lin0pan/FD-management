/**
 * Household composition — how many grown-ups and how many children live in a household. The counts
 * drive the price (US-07) and are derived from the birthdates on file, never stored (ADR-007), so a
 * count contradicting the household is not something the system can express.
 */

import { berlinDayKey } from "../distribution/attendance";
import { BirthDateInFuture, EmptyHousehold } from "../errors";

/** The age, in years, at which a household member stops counting as a child (US-13). */
export const GROWN_UP_AGE_YEARS = 13;

/** A household member as this rule sees them: a birthdate. Records carrying more stay assignable. */
export interface HouseholdMember {
  readonly birthDate: Date;
}

/** The derived split of a household. Always sums to the number of members. */
export interface HouseholdComposition {
  readonly grownUps: number;
  readonly children: number;
}

/**
 * The instant of the UTC day a **birthdate** falls on — a calendar day, not a moment, so a member's
 * status cannot depend on the time of day the record was written.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The instant of the calendar day an evaluation moment falls on **in Europe/Berlin**, comparable
 * with {@link utcDay}.
 *
 * `today` is the one real moment here — it comes off the clock while somebody stands at the counter
 * in Germany — so a member born on the 15th is a grown-up from 00:00 Berlin, not 01:00 as a UTC
 * comparison would have it (US-13.1). Taken from the attendance rules rather than restated.
 */
function berlinDay(instant: Date): number {
  return Date.parse(`${berlinDayKey(instant)}T00:00:00.000Z`);
}

/**
 * The day a member born on `birthDate` turns {@link GROWN_UP_AGE_YEARS}.
 *
 * `Date.UTC` rolls a 29 February birthdate to 1 March, which is the German civil-law convention
 * (§ 188 Abs. 3 BGB). Thirteen years after a leap year is never itself one, so this rolls every time.
 */
function grownUpFrom(birthDate: Date): number {
  return Date.UTC(
    birthDate.getUTCFullYear() + GROWN_UP_AGE_YEARS,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
}

/**
 * Split a household into grown-ups and children as of `today`. A member is a grown-up **on** their
 * 13th birthday, turning over at Berlin midnight — a read-time derivation, not a job, so the counts
 * and the price follow a birthday with no staff action (US-13).
 *
 * @throws {EmptyHousehold} if `members` is empty — answering `{ grownUps: 0, children: 0 }` would
 *   let a data-entry mistake through as a free household.
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
 * A member's age in completed years as of `today`, shown beside each birthdate on the customer record
 * (`tasks/prd-us-16-maintain-customer-record.md` §US-16.5). Shares {@link composition}'s anniversary
 * convention, and is derived on every read for the reason the counts are.
 *
 * @throws {BirthDateInFuture} if `birthDate` lies after `today`.
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
