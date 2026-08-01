/**
 * Which group is collecting, and where the number on screen sits in it (US-21).
 *
 * The counter is driven by a typed number (US-04), which is the right control when a household hands
 * over a card and the wrong one when nobody has: which numbers belong to Rot and which to Blau is the
 * software's decision (US-01), so working through a group by typing means guessing. This use case is
 * what the two walk controls read — it names the group and answers "the number before this one, and
 * the number after", so pressing a button is one click rather than a lookup staff have to phrase.
 *
 * Three decisions are worth stating, because each could plausibly have gone the other way:
 *
 * - **The group walked is the week's own**, `getWeekColour`'s `colour` — the one the banner badges
 *   beside the calendar week, and on a distribution day necessarily the group being served. It is
 *   deliberately *not* `nextDistribution.colour`: those part company on the days between a
 *   distribution and the next one, and a screen that says "blaue Woche" while its walk hands out red
 *   households is answering a question nobody asked. It does not follow the group of the household on
 *   screen either, so the screen never names two groups at once.
 * - **A looked-up number need not belong to the group.** `neighbours` compares numerically, so a Rot
 *   household looked up on a Blau day still positions the walk between the Blau numbers around it
 *   (§FR-5) rather than stranding the controls.
 * - **The membership query is the existing `CustomerRepository.list`**, which already filters by group
 *   and status and already answers lowest customer number first. No port method was added: at FD's
 *   ~240 customers this is the same read `/kunden` performs on every visit.
 *
 * Nothing is written — no record, no reminder, no status change and no audit entry. Navigation is a
 * read, like the lookup it drives (US-04, FR-4).
 */

import { counterQueryOrNull } from "@/domain/card/cardNumber";
import type { CustomerStatus } from "@/domain/customer/customer";
import { neighbours } from "@/domain/distribution/groupWalk";
import type { WeekColour } from "@/domain/policy/settings";
import type { Clock, CustomerRepository, SettingsRepository } from "../ports";
import { getWeekColour } from "./get-week-colour";

export interface ReadGroupRosterDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/**
 * The statuses a walk covers (PRD §FR-2).
 *
 * Blocked households are walked because a block is something the counter has to *state* — the verdict
 * is the whole point of stopping at them — while archived ones are not, because they no longer hold
 * the slot. What a freed number looks up to is the counter's own question (US-04.2), not the walk's.
 */
const WALKED_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED"];

/** What the walk controls beside the number field know. */
export interface GroupRosterView {
  /** The group being walked — the week's own, stated in words on screen. */
  readonly group: WeekColour;
  /** The number **Zurück** leads to, or `null` when that end has been walked out. */
  readonly previous: number | null;
  /** The number **Weiter** leads to, or `null` when that end has been walked out. */
  readonly next: number | null;
  /**
   * Whether the group holds no walkable household at all — a state the screen says in words rather
   * than showing as two dead controls that look like the end of a walk.
   */
  readonly isEmpty: boolean;
}

/**
 * The group of the week being read in, and the numbers either side of `rawQuery` within it.
 *
 * `rawQuery` is whatever stands in the screen's `nummer` parameter, read with the domain's
 * `counterQueryOrNull`: `50` and `50k3` both mean the number 50 (§FR-6), and anything unreadable — or
 * an absent query — means "nothing looked up yet", which is where a freshly opened screen stands and
 * never an error.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect today — the same failure the
 *   banner already has, on the same screen.
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export async function readGroupRoster(
  deps: ReadGroupRosterDeps,
  rawQuery?: string,
): Promise<GroupRosterView> {
  const week = await getWeekColour(deps);
  const group = week.colour;
  const members = await deps.customers.list({ statuses: WALKED_STATUSES, group });
  // The register's order is the walk's raw material, not its rule: `neighbours` scans, so nothing
  // here restates that the list came back lowest number first.
  const numbers = members.map((customer) => customer.customerNumber);

  return {
    group,
    ...neighbours(numbers, positionOf(rawQuery)),
    isEmpty: numbers.length === 0,
  };
}

/**
 * The customer number the walk stands at, or `null` for "nothing looked up yet".
 *
 * A card index is dropped: `50k3` positions the walk at household 50, because the walk is about which
 * household the screen is on and not about which piece of card is current (US-04.1).
 */
function positionOf(rawQuery: string | undefined): number | null {
  const query = rawQuery === undefined ? null : counterQueryOrNull(rawQuery);
  return query === null ? null : query.customerNumber;
}
