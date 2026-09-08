/**
 * Turn a typed number into the one verdict a staff member reads, with everything the screen shows
 * below it (`tasks/prd-us-04-lookup-customer.md` §US-04.2).
 *
 * **Only a read**: turning someone away records nothing (FR-4), it takes no audit log, and it calls
 * only the reading methods of its stores — the writes live in `recordAttendance` and
 * `recordReminder`.
 *
 * Everything on the screen is derived through the same seams the card view uses
 * (`describeAllowance`, `getWeekColour`), so the counter cannot disagree with the rest of the app,
 * and it is all read in one pass — the counter never issues a second query (US-04.3).
 */

import { formatCardNumber, parseCounterQuery } from "@/domain/card/cardNumber";
import { staleCardReason, type StaleCardReason } from "@/domain/card/staleCard";
import type { CustomerStatus } from "@/domain/customer/customer";
import { groupOf, type Group } from "@/domain/customer/group";
import type { HouseholdComposition } from "@/domain/customer/householdComposition";
import { berlinDayKey, recordForDay } from "@/domain/distribution/attendance";
import { amountToPay, askedForRecord, balanceOf } from "@/domain/distribution/balance";
import {
  certificateExpired,
  evaluateAtCounter,
  type Verdict,
} from "@/domain/distribution/counterVerdict";
import type { Cents } from "@/domain/money";
import { describeAllowance } from "../allowance/describe-allowance";
import { getWeekColour } from "../distribution/get-week-colour";
import { countNoShows } from "./count-no-shows";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  ReminderLogRepository,
  SettingsRepository,
} from "../ports";

export interface LookupCustomerDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
  readonly clock: Clock;
}

/**
 * Everything the counter screen shows below the verdict, derived at read time — no stored column here
 * could have fallen behind reality.
 */
export interface CounterCustomerView {
  readonly firstName: string;
  readonly lastName: string;
  readonly customerNumber: number;
  readonly group: Group;
  readonly grownUps: number;
  readonly children: number;
  readonly priceCents: Cents;
  /**
   * How many eggs this household is handed today (US-28) — copied from the allowance, so the counter
   * cannot count them differently from the record. Never zero-as-blank: entitled to none shows 0.
   */
  readonly eggs: number;
  /** The day the needs certificate lapses — shown so staff can start the renewal conversation. */
  readonly certificateValidUntil: Date;
  /**
   * Whether that day has passed, judged against the same instant the verdict is (US-32.5). Stated
   * here rather than read off the verdict kind, because a household that already collected is
   * `ALREADY_SERVED_TODAY` (US-32.4) and the lapsed certificate is still true of them.
   */
  readonly certificateExpired: boolean;
  readonly status: CustomerStatus;
  /**
   * Why this household is paused, or `null` (US-08). Repeated from the verdict because the counter
   * offers to lift the block from the same screen (US-16.5) and the confirmation quotes the reason —
   * a control reading it off the verdict union would be a second account of where it lives.
   */
  readonly blockReason: string | null;
  readonly reminderCount: number;
  /**
   * How many of their own distributions this household has missed in a row (US-10.1), off records
   * already loaded. Shown and nothing more — the archiving decision is always a human one (FR-1).
   */
  readonly consecutiveNoShows: number;
  readonly notes: string;
  /** The number of the card the customer holds today, e.g. `50k3`. */
  readonly cardNumber: string;
  /**
   * What is printed on the piece of card the household holds (US-13.3). Read so the counter's note
   * can name it, and nothing else — what the household *is* is `grownUps`/`children` above.
   */
  readonly countsOnCard: HouseholdComposition;
  /**
   * The group printed on that same card — the parity of the slot it was printed under (ADR-016,
   * ADR-017). The household's own group unless a **superseded** card was presented, which is exactly
   * when the counter needs to see it.
   */
  readonly groupOnCard: Group;
  /**
   * Why the card in the household's pocket no longer prints what is true of them, or `null` (US-13.4),
   * compared against the counts just read above.
   *
   * **Nothing follows from it** — a stale card is never grounds to turn anyone away (FR-5), and
   * `evaluateAtCounter` never sees this field.
   */
  readonly staleCard: StaleCardReason | null;
  /**
   * Where the household stands with DF (US-29), off the history already loaded — never stored
   * (ADR-015). The balance **as it stands now**, today's hand-out included when one was recorded.
   */
  readonly balanceCents: Cents;
  /**
   * What to collect today: {@link priceCents} offset by {@link balanceCents}, floored at zero (US-29,
   * rule 3). For a household already served it is what they *would* be asked again — their payment is
   * already in the balance — and the screen shows `askedCents` instead (US-29.7).
   */
  readonly amountToPayCents: Cents;
}

/**
 * The record the customer already holds for today — what the counter shows instead of the serve
 * action (US-05.4). The three money figures are three different questions: what was handed over,
 * what was asked for on the day, and where a removal would leave the household.
 */
export interface TodaysRecordView {
  readonly recordId: number;
  readonly at: Date;
  /** What the household handed over — the stored amount, which the correction form opens on. */
  readonly paidCents: Cents;
  /**
   * What the counter asked for that day: the price offset by the balance of the *earlier* hand-outs
   * only, replayed from the history rather than stored — which is why a household settling an old
   * debt reads as having paid what it was asked rather than as paying ahead.
   */
  readonly askedCents: Cents;
  /**
   * The balance the household would return to if this record were removed, so the warning can name it
   * (US-29, rule 9) — derived here rather than in the component, which would decide it twice.
   */
  readonly balanceWithoutRecordCents: Cents;
}

/**
 * The result of a counter lookup. `customer` and `customerId` are `null` exactly when the verdict is
 * `NOT_FOUND`, so the screen has supporting data for every verdict it can act on; `customerId` is the
 * surrogate id the serve action records against, not the customer number (FR-6).
 */
export interface CounterLookup {
  readonly verdict: Verdict;
  readonly customer: CounterCustomerView | null;
  readonly customerId: number | null;
  readonly todaysRecord: TodaysRecordView | null;
  /**
   * Whether a certificate reminder is already on file for today (US-06.4), so the action stays
   * disabled across reloads — the screen must not offer what the rule is bound to refuse.
   */
  readonly reminderLoggedToday: boolean;
}

/**
 * Resolve `rawQuery` — a card number (`50k3`) or a bare customer number (`50`) — and return the
 * verdict with the data the screen shows. An unassigned number is `NOT_FOUND`, not an error.
 *
 * @throws {InvalidCardNumber} if `rawQuery` is not a customer number or a card number.
 * @throws {NoSettingsInForce} if no settings version had taken effect by today.
 */
export async function lookupCustomer(
  deps: LookupCustomerDeps,
  rawQuery: string,
): Promise<CounterLookup> {
  const query = parseCounterQuery(rawQuery);
  const today = deps.clock.now();
  const [customer, week] = await Promise.all([
    deps.customers.findByCustomerNumber(query.customerNumber),
    getWeekColour(deps, today),
  ]);

  if (customer === null) {
    // The rule decides the verdict even here rather than this use case naming `NOT_FOUND` itself:
    // the precedence lives in one place.
    return {
      verdict: evaluateAtCounter({
        customer: null,
        presentedCardIndex: query.cardIndex,
        today,
        weekColour: week.colour,
        servedToday: false,
      }),
      customer: null,
      customerId: null,
      todaysRecord: null,
      reminderLoggedToday: false,
    };
  }

  // Loaded with the customer rather than on a later click, so the serve action, the correction of an
  // existing record and the reminder action are all offered in one render (US-04.3, US-05.4, US-06.4).
  const [recordsForCustomer, todaysReminder] = await Promise.all([
    deps.records.listForCustomer(customer.id),
    deps.reminders.findOnDay(customer.id, berlinDayKey(today)),
  ]);
  const existing = recordForDay(recordsForCustomer, today);

  const verdict = evaluateAtCounter({
    // The current card index comes off the row loaded above rather than a second query (US-04.3).
    customer: {
      customerNumber: customer.customerNumber,
      status: customer.status,
      group: groupOf(customer.customerNumber),
      blockReason: customer.blockReason,
      currentCardIndex: customer.card.index,
      certificateValidUntil: customer.details.certificate.validUntil,
      reminderCount: customer.reminderCount,
    },
    presentedCardIndex: query.cardIndex,
    today,
    weekColour: week.colour,
    // The fact, not the record (US-32.4), off the hand-out already loaded — so the verdict cannot
    // disagree with what the screen shows.
    servedToday: existing !== null,
  });
  // Off the records just loaded (US-04.3, US-29.5), as the balance stands *now* — so a hand-out
  // already recorded today is counted in.
  const balanceCents = balanceOf(recordsForCustomer);
  const todaysRecord =
    existing === null
      ? null
      : {
          recordId: existing.id,
          at: existing.date,
          paidCents: existing.paidCents,
          askedCents: askedForRecord(recordsForCustomer, existing),
          balanceWithoutRecordCents: balanceOf(
            recordsForCustomer.filter((record) => record.id !== existing.id),
          ),
        };

  const [allowance, consecutiveNoShows] = await Promise.all([
    describeAllowance(deps, customer.details.householdMembers, today),
    countNoShows(deps, customer, recordsForCustomer, today),
  ]);
  return {
    verdict,
    customerId: customer.id,
    todaysRecord,
    reminderLoggedToday: todaysReminder !== null,
    customer: {
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      customerNumber: customer.customerNumber,
      group: groupOf(customer.customerNumber),
      grownUps: allowance.grownUps,
      children: allowance.children,
      priceCents: allowance.priceCents,
      eggs: allowance.eggs,
      certificateValidUntil: customer.details.certificate.validUntil,
      certificateExpired: certificateExpired(customer.details.certificate.validUntil, today),
      status: customer.status,
      blockReason: customer.blockReason,
      reminderCount: customer.reminderCount,
      consecutiveNoShows,
      notes: customer.details.notes,
      cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
      countsOnCard: customer.card.countsAtIssue,
      // Off the card's **own** slot, so a superseded card names the week it was printed for rather
      // than the one its household collects in today (ADR-016, ADR-017).
      groupOnCard: groupOf(customer.card.customerNumber),
      balanceCents,
      amountToPayCents: amountToPay(allowance.priceCents, balanceCents),
      staleCard: staleCardReason(customer.card.countsAtIssue, {
        grownUps: allowance.grownUps,
        children: allowance.children,
      }),
    },
  };
}
