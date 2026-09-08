/**
 * Read one customer as their card view shows them. Everything derivable is derived here and handed to
 * the screen ready to render, which is what keeps the rules out of the presentation layer.
 */

import { formatCardNumber, nextCardNumber } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import { countByGroup, groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import { ageInYears, type HouseholdComposition } from "@/domain/customer/householdComposition";
import { balanceOf, replayPayments, type Settlement } from "@/domain/distribution/balance";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import { CustomerNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { describeAllowance, type Allowance } from "../allowance/describe-allowance";
import type {
  CardRepository,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { countNoShows } from "./count-no-shows";
import { listNumberChoices, type NumberChoice } from "./list-number-choices";

export interface ReadCustomerDeps {
  readonly customers: CustomerRepository;
  /** Read only, for the number control: how far the run on every slot has got (US-30.4). */
  readonly cards: CardRepository;
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
  /**
   * The week the household collects in, from the number they hold (ADR-017). On the read model rather
   * than left to the screen, so nothing on the record can work it out differently.
   */
  readonly group: Group;
  /** Derived from the birthdates as of today; there is no stored count to read (ADR-007). */
  readonly composition: HouseholdComposition;
  /** The household, each member carrying their current age. Same order as on the record. */
  readonly household: ReadonlyArray<HouseholdMemberView>;
  /**
   * The number printed on the card, e.g. `12k1` — off the slot **that card** was printed under, never
   * the household's current one, so a household that has moved is never shown a number naming a
   * different card (ADR-016).
   */
  readonly cardNumber: string;
  /**
   * The number a replacement would carry, e.g. `12k2`. Named before a reissue is written so staff
   * confirm the number they are about to hand out
   * (`tasks/prd-us-09-reissue-card-after-loss.md` §US-09.3); showing it changes nothing.
   */
  readonly nextCardNumber: string;
  /**
   * The standard price for this household today, through the same seam the counter reads
   * (`describeAllowance`), so the two screens cannot disagree. The counts above are a slice of it.
   */
  readonly allowance: Allowance;
  /**
   * How many of their own distributions the household has missed in a row (US-10.1). Shown and
   * nothing more — no threshold lives here and no action follows from any value (PRD §5).
   */
  readonly consecutiveNoShows: number;
  /**
   * Where the household stands (US-29.6), derived on every read from the very records `history` lists
   * (ADR-015).
   *
   * An **archived** household keeps theirs — nothing here looks at the status, because leaving the
   * register writes no debt off — and one that **re-registers** starts at zero with as little code,
   * a new row having no hand-outs hanging off its surrogate id (ADR-008).
   */
  readonly balanceCents: Cents;
  /**
   * Every hand-out the household has collected, **most recent first** (US-16.5).
   *
   * The price is the record's own, never a fresh derivation: re-deriving from today's settings would
   * silently rewrite what a household paid last March (US-05, FR-2). `askedCents` is likewise what was
   * asked *then*, replayed from those prices. The order is applied here rather than asked of the
   * store, because the same rows feed the no-show count, which reads them as a set.
   */
  readonly history: ReadonlyArray<Settlement<DistributionRecord>>;
  /**
   * How many **active** households each group holds, counted from the numbers they hold (ADR-017).
   *
   * Moving a household between the weeks is a comparison — staff move somebody to even the groups
   * out — so the sizes belong beside the number control that does it (PRD §FR-4).
   */
  readonly groupCounts: GroupCounts;
  /**
   * Every number this household may be moved to (US-30), each with the card number that move would
   * print — the free pool **plus the number they hold**, which is what the control opens on.
   *
   * Here rather than on the screen so nothing has to work out a card number, and nothing can work one
   * out differently. An **archived** household gets none — they hold no slot.
   */
  readonly numberChoices: ReadonlyArray<NumberChoice>;
  /**
   * The day every figure above was worked out as of, and the day the household editor judges its rows
   * against while they are typed (US-16.5). Handed out rather than read in the browser, whose clock is
   * its own and in a zone of its own — a household counted against it would flicker onto a different
   * answer than the save derives.
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
  const [allowance, records, takenNumbers, numberChoices] = await Promise.all([
    describeAllowance(deps, customer.details.householdMembers),
    deps.records.listForCustomer(customer.id),
    deps.customers.takenActiveNumbers(),
    listNumberChoices(deps, customer),
  ]);
  // Counted off the numbers the register holds rather than asked of it: a group is not a column, it
  // is what a number is (ADR-017).
  const groupCounts = countByGroup(takenNumbers);

  // Two different questions. The number *printed* on the card comes off that card's own slot; the
  // number a *reissue* would print comes off the household, since a replacement is printed on the
  // slot they hold today. After a move the two agree (US-30.3), but neither may assume it.
  const next = nextCardNumber({
    customerNumber: customer.customerNumber,
    index: customer.card.index,
  });

  return {
    customer,
    group: groupOf(customer.customerNumber),
    composition: { grownUps: allowance.grownUps, children: allowance.children },
    household: customer.details.householdMembers.map((member) => ({
      firstName: member.firstName,
      lastName: member.lastName,
      birthDate: member.birthDate,
      age: ageInYears(member.birthDate, today),
    })),
    cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
    nextCardNumber: formatCardNumber(next.customerNumber, next.index),
    allowance,
    consecutiveNoShows: await countNoShows(deps, customer, records, today),
    balanceCents: balanceOf(records),
    // `replayPayments` walks oldest first, the only order a running balance can be built in; the
    // reversal is the *display* order (US-16.5), not part of the arithmetic.
    history: [...replayPayments(records)].reverse(),
    groupCounts,
    numberChoices,
    today,
  };
}
