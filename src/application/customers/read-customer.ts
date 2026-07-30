/**
 * Read one customer as their card view shows them.
 *
 * Everything derivable is derived here and handed to the screen ready to render — the household
 * counts from the birthdates and the card number from the slot and the card index. The page then has
 * nothing left to work out, which is what keeps the rules out of the presentation layer.
 */

import { formatCardNumber, nextCardNumber } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import { ageInYears, type HouseholdComposition } from "@/domain/customer/householdComposition";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import { CustomerNotFound } from "@/domain/errors";
import { describeAllowance, type Allowance } from "../allowance/describe-allowance";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { countNoShows } from "./count-no-shows";

export interface ReadCustomerDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  /** Read only, for the no-show count: a hand-out history is what says which days were not missed. */
  readonly records: DistributionRecordRepository;
  readonly clock: Clock;
}

/** A household member with their age worked out, so the screen renders it rather than deriving it. */
export interface HouseholdMemberView {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  /** Completed years as of today — derived on every read, never stored. */
  readonly age: number;
}

export interface CustomerCardView {
  readonly customer: RegisteredCustomer;
  /** Derived from the birthdates as of today — never read from a stored count, which there is none of. */
  readonly composition: HouseholdComposition;
  /** The household, each member carrying their current age. Same order as on the record. */
  readonly household: ReadonlyArray<HouseholdMemberView>;
  /** The number printed on the card, e.g. `12k1`. Derived from the slot and the card index. */
  readonly cardNumber: string;
  /**
   * The number a replacement would carry, e.g. `12k2` — the same slot, the next index. The record
   * names it before a reissue is written so staff confirm the number they are about to hand out
   * (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3); issuing it is what makes it real, so
   * showing it changes nothing.
   */
  readonly nextCardNumber: string;
  /**
   * The standard portions and price for this household as of today — derived through the same seam
   * the counter reads (`describeAllowance`), so the two screens can never disagree. The counts here
   * are a slice of it, not a second derivation.
   */
  readonly allowance: Allowance;
  /**
   * How many of their own distributions the household has missed in a row (US-10.1) — one of the two
   * situations in which staff may decide to archive. It is shown and nothing more: no threshold lives
   * here and no action follows from any value (PRD §5).
   */
  readonly consecutiveNoShows: number;
  /**
   * Every hand-out the household has collected, **most recent first** (US-16.5) — the day, whether
   * they showed up, whether they paid, and what it cost them.
   *
   * The price is the record's own rather than a fresh derivation: a distribution is priced by the
   * policy in force on the day it happened, and re-deriving it from today's settings would silently
   * rewrite what a household paid last March (US-05, FR-2). The order is applied here rather than
   * asked of the store, because the same rows feed the no-show count, which reads them as a set.
   */
  readonly history: ReadonlyArray<DistributionRecord>;
  /**
   * How many **active** households each balancing group holds, as of now.
   *
   * The record is where a household is moved between RED and BLUE (US-16.4), and that decision is a
   * comparison: staff move somebody in order to even the two groups out, so the sizes belong beside
   * the choice rather than on a screen they would have to fetch first (PRD §FR-4).
   */
  readonly groupCounts: GroupCounts;
  /**
   * The day every derived figure above was worked out as of — and the day the record's household
   * editor must judge its rows against while they are being typed (US-16.5).
   *
   * It is handed out rather than left for the screen to read, for the reason `proposeRegistration`
   * hands out its own: a browser has a clock of its own, in a zone of its own, and a household
   * counted against it would flicker onto a different answer than the save derives.
   */
  readonly today: Date;
}

/**
 * The customer behind an id, with their counts and card number worked out as of today.
 *
 * @throws {CustomerNotFound} if no customer has that id.
 */
export async function readCustomer(deps: ReadCustomerDeps, id: number): Promise<CustomerCardView> {
  const customer = await deps.customers.findById(id);
  if (customer === null) {
    throw new CustomerNotFound(id);
  }

  const today = deps.clock.now();
  const [allowance, records, groupCounts] = await Promise.all([
    describeAllowance(deps, customer.details.householdMembers),
    deps.records.listForCustomer(customer.id),
    deps.customers.groupCounts(),
  ]);

  const held = { customerNumber: customer.customerNumber, index: customer.card.index };
  const next = nextCardNumber(held);

  return {
    customer,
    composition: { grownUps: allowance.grownUps, children: allowance.children },
    household: customer.details.householdMembers.map((member) => ({
      firstName: member.firstName,
      lastName: member.lastName,
      birthDate: member.birthDate,
      age: ageInYears(member.birthDate, today),
    })),
    cardNumber: formatCardNumber(held.customerNumber, held.index),
    nextCardNumber: formatCardNumber(next.customerNumber, next.index),
    allowance,
    consecutiveNoShows: await countNoShows(deps, customer, records, today),
    history: [...records].sort((a, b) => b.date.getTime() - a.date.getTime()),
    groupCounts,
    today,
  };
}
