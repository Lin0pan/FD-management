/**
 * The one seam turning a household plus a date into the counts, the price and the eggs — read by the
 * counter (US-04) and the record (US-05) alike, so neither can disagree with the other
 * (`tasks/prd-us-07-portions-and-price.md` §US-07.3).
 *
 * It takes a date and reads settings **history** rather than `readCurrentSettings`, because a
 * distribution record keeps the money and nothing else: what a past distribution comprised can only
 * be stated by resolving the version in force then.
 */

import { composition, type HouseholdMember } from "@/domain/customer/householdComposition";
import type { Cents } from "@/domain/money";
import { eggsFor } from "@/domain/policy/eggs";
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
  /**
   * How many eggs the household is handed alongside the food (US-28). Free, so unrelated to
   * `priceCents`, and derived from the *number of people* — a 13th birthday leaves it where it was.
   */
  readonly eggs: number;
}

/**
 * The allowance for `household` on `date`, or on the clock's today. Counts and settings are resolved
 * at the same instant, so a past distribution is priced with the ages and policy of the day.
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
 * The allowance for many households on one date, reading the settings history **once** — the customer
 * list derives these for every row (US-15.1), and a version-history query per row would be one per
 * household. Same arithmetic as {@link describeAllowance}.
 *
 * The date is required rather than defaulted: reading the clock again here would risk two rows of one
 * list being priced on different days.
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

/** The policy values in force at `at` — the one read either entry point makes. */
async function settingsAt(deps: DescribeAllowanceDeps, at: Date): Promise<Settings> {
  return resolveSettingsAt(await deps.settings.listVersions(), at);
}

/** The arithmetic: counts from the birthdates, price and eggs from the policy values. */
function allowanceAt(
  settings: Settings,
  household: ReadonlyArray<HouseholdMember>,
  at: Date,
): Allowance {
  const { grownUps, children } = composition(household, at);
  return {
    grownUps,
    children,
    priceCents: priceFor(settings, grownUps, children),
    // The composition's own total, never a second count of `household`: the browser preview filters
    // half-typed rows out, so counting again would be free to disagree with the first answer.
    eggs: eggsFor(settings.eggRule, grownUps + children),
  };
}
