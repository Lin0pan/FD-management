/**
 * The one seam that turns a household plus a date into the counts and the price — read by the counter
 * screen (US-04) and by the customer record (US-05) alike, so neither recomputes the arithmetic and
 * neither can disagree with the other (tasks/prd-us-07-portions-and-price.md §US-07.3).
 *
 * Everything here is derived, nothing stored: the grown-up/children split from the birthdates, the
 * price from the settings **in force on the evaluated date**. A distribution record keeps only a
 * `paid` flag, so the only way to state what a past distribution cost is to resolve the version that
 * was in force then — which is why this takes a date and reads settings history rather than
 * `readCurrentSettings`.
 */

import { composition, type HouseholdMember } from "@/domain/customer/householdComposition";
import type { Cents } from "@/domain/money";
import { priceFor, resolveSettingsAt, type Settings } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";

export interface DescribeAllowanceDeps {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** Who a household is and what it owes at one distribution — every value derived, none stored. */
export interface Allowance {
  readonly grownUps: number;
  readonly children: number;
  readonly priceCents: Cents;
}

/**
 * The allowance for `household` on `date`, or on the clock's today when no date is given.
 *
 * Both the counts and the settings are resolved at the same instant: a past distribution has to be
 * priced with the members' ages and the policy values as they stood then, not as they stand now.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect by that date.
 * @throws {EmptyHousehold} if the household has no members.
 * @throws {BirthDateInFuture} if a member was born after the evaluated date.
 */
export async function describeAllowance(
  deps: DescribeAllowanceDeps,
  household: ReadonlyArray<HouseholdMember>,
  date?: Date,
): Promise<Allowance> {
  const at = date ?? deps.clock.now();
  return allowanceAt(await settingsAt(deps, at), household, at);
}

/**
 * The allowance for many households on one date, reading the settings history **once**.
 *
 * The customer list derives both values for every row it shows (US-15.1), and asking the store for
 * its version history per row would be a query per household on a screen that already has all of
 * them in hand. The arithmetic is the same function {@link describeAllowance} uses, so the list and
 * the counter cannot disagree about what a household owes — which is the whole reason this module
 * exists.
 *
 * The date is required rather than defaulted: a caller holding many households has already fixed the
 * instant it is asking about, and letting this read the clock a second time would risk two rows of
 * one list being priced on different days.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect by that date.
 * @throws {EmptyHousehold} if one of the households has no members.
 * @throws {BirthDateInFuture} if a member was born after the evaluated date.
 */
export async function describeAllowances(
  deps: DescribeAllowanceDeps,
  households: ReadonlyArray<ReadonlyArray<HouseholdMember>>,
  date: Date,
): Promise<ReadonlyArray<Allowance>> {
  const settings = await settingsAt(deps, date);
  return households.map((household) => allowanceAt(settings, household, date));
}

/** The policy values in force at `at` — the one read of the settings history either entry point makes. */
async function settingsAt(deps: DescribeAllowanceDeps, at: Date): Promise<Settings> {
  return resolveSettingsAt(await deps.settings.listVersions(), at);
}

/** The arithmetic itself: the counts from the birthdates, the price from the policy values. */
function allowanceAt(
  settings: Settings,
  household: ReadonlyArray<HouseholdMember>,
  at: Date,
): Allowance {
  const { grownUps, children } = composition(household, at);
  return { grownUps, children, priceCents: priceFor(settings, grownUps, children) };
}
