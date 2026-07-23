/**
 * The portion allowance and price for one household at a point in time — the single seam the counter
 * screen (US-04) and the customer record (US-05) both read, so neither recomputes the arithmetic and
 * neither can disagree with the other (tasks/prd-us-07-portions-and-price.md §US-07.3).
 *
 * Everything here is derived, nothing stored: the grown-up/children split from the birthdates, the
 * portions and the price from the settings **in force on the evaluated date**. A distribution record
 * keeps only a `paid` flag, so the only way to state what a past distribution cost is to resolve the
 * version that was in force then — which is why this takes a date and reads settings history rather
 * than `readCurrentSettings`.
 */

import { composition, type HouseholdMember } from "@/domain/customer/householdComposition";
import type { Cents } from "@/domain/money";
import { portionsFor } from "@/domain/policy/portions";
import { priceFor, resolveSettingsAt } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";

export interface DescribeAllowanceDeps {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** What a household receives and owes at one distribution — all four values derived, none stored. */
export interface Allowance {
  readonly grownUps: number;
  readonly children: number;
  readonly portions: number;
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
  const settings = resolveSettingsAt(await deps.settings.listVersions(), at);
  const { grownUps, children } = composition(household, at);
  return {
    grownUps,
    children,
    portions: portionsFor({ grownUps, children }, settings),
    priceCents: priceFor(settings, grownUps, children),
  };
}
