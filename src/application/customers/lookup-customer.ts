/**
 * Look a customer up at the counter: turn a typed number into the one verdict a staff member reads,
 * with everything the screen shows below it (tasks/prd-us-04-lookup-customer.md §US-04.2).
 *
 * This is the single most-used read in the product, and it is *only* a read — turning someone away
 * for the wrong group or an outdated card records nothing (FR-4). It takes no audit log, and it calls
 * only the reading methods of its stores (`listForCustomer` for the day's record beside the serve
 * action, `findOnDay` for whether today's reminder is already logged): the write paths live in
 * `recordAttendance` and `recordReminder`, not here, so this use case still cannot change state.
 *
 * Nothing on the screen is stored. The counts come from the birthdates, the price from the settings
 * in force today, and the card number from the slot and the current card index —
 * all derived here through the same seams the card view uses (`describeAllowance`, `getWeekColour`),
 * so the counter can never disagree with the rest of the app. The day's record is read alongside
 * them, in the same pass, so the counter never issues a second query (US-04.3).
 */

import { formatCardNumber, parseCounterQuery } from "@/domain/card/cardNumber";
import { staleCardReason, type StaleCardReason } from "@/domain/card/staleCard";
import type { CustomerStatus } from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import type { HouseholdComposition } from "@/domain/customer/householdComposition";
import { berlinDayKey, recordForDay } from "@/domain/distribution/attendance";
import { amountToPay, askedForRecord, balanceOf } from "@/domain/distribution/balance";
import { evaluateAtCounter, type Verdict } from "@/domain/distribution/counterVerdict";
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
 * Everything the counter screen shows below the verdict. Every value is derived at read time — the
 * counts and allowance from the birthdates and today's settings, the card number from the slot — so
 * there is no stored column here that could have fallen behind reality.
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
   * cannot count them differently from the customer record. Free, and never zero-as-blank: a
   * household entitled to none shows 0.
   */
  readonly eggs: number;
  /** The day the needs certificate lapses — shown so staff can start the renewal conversation. */
  readonly certificateValidUntil: Date;
  readonly status: CustomerStatus;
  /**
   * Why this household is paused, or `null` while they are not (US-08).
   *
   * The verdict states it too, because it *is* the verdict for a blocked household. It is repeated
   * here because the counter now offers to lift the block from the same screen (US-16.5), and the
   * confirmation quotes the reason being lifted — a control reading it off the verdict union would
   * be a second, quietly diverging account of which field the reason lives in.
   */
  readonly blockReason: string | null;
  readonly reminderCount: number;
  /**
   * How many of their own distributions this household has missed in a row (US-10.1). Read from the
   * records the lookup has already loaded, so it costs the counter no further query. It is shown and
   * nothing more — the archiving decision it feeds is always a human one (US-10, FR-1).
   */
  readonly consecutiveNoShows: number;
  readonly notes: string;
  /** The number of the card the customer holds today, e.g. `50k3`. */
  readonly cardNumber: string;
  /**
   * What is printed on the piece of card the household holds — the snapshot taken when it was
   * issued (US-13.3). Read so the counter's note can name it, and for nothing else: what the
   * household *is* is `grownUps`/`children` above, derived from the birthdates like everywhere.
   */
  readonly countsOnCard: HouseholdComposition;
  /** The group printed on that same piece of card, read only to be compared with `group` above. */
  readonly groupOnCard: Group;
  /**
   * Why the card in the household's pocket no longer prints what is true of them, or `null` when it
   * still does (US-13.4, US-16.4). It is compared against the counts and the group just read above,
   * so the note and the values beside it can never tell different stories.
   *
   * Nothing follows from it. A stale card is never grounds to turn anyone away (FR-5): the verdict
   * is decided by `evaluateAtCounter`, which never sees this field, and the screen states it as a
   * quiet note beside the household's data rather than as a warning.
   */
  readonly staleCard: StaleCardReason | null;
  /**
   * Where the household stands with DF (US-29): negative when they still owe money, positive when
   * they have paid ahead, zero when they are square. Derived from the hand-out history the lookup
   * has already loaded — `Σ (paidCents − priceCents)`, never stored — so it costs no further query.
   *
   * It is the balance **as it stands now**, today's hand-out included when one has been recorded.
   * The screen words it through `balanceKind` rather than reading the sign itself.
   */
  readonly balanceCents: Cents;
  /**
   * What to collect from this household today: {@link priceCents} offset by {@link balanceCents} and
   * floored at zero (US-29, rule 3). Derived here so the counter renders a figure rather than
   * working one out.
   *
   * For a household already served today it is what they *would* be asked for if they were served
   * again — their payment is already in the balance. The screen does not show it in that state
   * (US-29.7); the record's own `askedCents` is what that half of the screen states.
   */
  readonly amountToPayCents: Cents;
}

/**
 * The record the looked-up customer already holds for today, if any — what the counter shows instead
 * of the serve action once a hand-out has been recorded (US-05.4). Carries the id so a same-day
 * correction can address it, and the instant so the screen can name the time they were served.
 *
 * The three money figures are three different questions, and the screen asks all three: what was
 * handed over, what was asked for on the day, and where a removal would leave the household.
 */
export interface TodaysRecordView {
  readonly recordId: number;
  readonly at: Date;
  /** What the household handed over — the stored amount, which the correction form opens on. */
  readonly paidCents: Cents;
  /**
   * What the counter asked for when this hand-out was recorded: the price offset by the balance of
   * the household's *earlier* hand-outs only. Nothing stores it — it is replayed from the history
   * (`replayPayments`), which is why a household settling an old debt reads as having paid what
   * they were asked for rather than as having paid ahead.
   */
  readonly askedCents: Cents;
  /**
   * The balance the household would return to if this record were removed, so the removal warning
   * can name it (US-29, rule 9). It is the balance of the other records — derived here rather than
   * in the component, which would be the arithmetic decided a second time.
   */
  readonly balanceWithoutRecordCents: Cents;
}

/**
 * The result of a counter lookup: the verdict, and — unless the number belongs to nobody — who it is
 * about. `customer` is `null` exactly when the verdict is `NOT_FOUND`, so the screen has the
 * supporting data for every verdict it can act on.
 *
 * `customerId` is the surrogate id the serve action records against — the slot's holder, not the
 * customer number (FR-6) — and is `null` on the same `NOT_FOUND` branch as `customer`. `todaysRecord`
 * is the hand-out already on file for today, or `null` when the customer may still be served; reading
 * it here keeps the counter to a single query (US-04.3).
 */
export interface CounterLookup {
  readonly verdict: Verdict;
  readonly customer: CounterCustomerView | null;
  readonly customerId: number | null;
  readonly todaysRecord: TodaysRecordView | null;
  /**
   * Whether a certificate reminder is already on file for today's Berlin day (US-06.4). Read here so
   * the reminder action stays disabled for the rest of the day across reloads and re-lookups — the
   * screen must not offer an action the once-per-day rule is bound to refuse. `false` on `NOT_FOUND`.
   */
  readonly reminderLoggedToday: boolean;
}

/**
 * Resolve `rawQuery` to a customer and return the counter verdict with the data the screen shows.
 *
 * The query is a card number (`50k3`) or a bare customer number (`50`); a bare number resolves to
 * the slot's current holder, and a card number whose index is below that holder's current card is
 * outdated. An unassigned number is `NOT_FOUND`, not an error.
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

  const verdict = evaluateAtCounter({
    // The current card index is the highest the customer holds, loaded with the row rather than
    // read separately — the counter never issues a second query (US-04.3). A blocked customer
    // carries the reason recorded when they were blocked (US-08), shown verbatim in the verdict.
    customer:
      customer === null
        ? null
        : {
            customerNumber: customer.customerNumber,
            status: customer.status,
            group: customer.group,
            blockReason: customer.blockReason,
            currentCardIndex: customer.card.index,
            certificateValidUntil: customer.details.certificate.validUntil,
            reminderCount: customer.reminderCount,
          },
    presentedCardIndex: query.cardIndex,
    today,
    weekColour: week.colour,
  });

  if (customer === null) {
    return {
      verdict,
      customer: null,
      customerId: null,
      todaysRecord: null,
      reminderLoggedToday: false,
    };
  }

  // The day's record and today's reminder are loaded with the customer, not on a later click, so the
  // screen can offer the serve action, the correction of an existing record and the reminder action
  // in one render (US-04.3, US-05.4, US-06.4).
  const [recordsForCustomer, todaysReminder] = await Promise.all([
    deps.records.listForCustomer(customer.id),
    deps.reminders.findOnDay(customer.id, berlinDayKey(today)),
  ]);
  const existing = recordForDay(recordsForCustomer, today);
  // The balance and everything hanging off it come from the records just loaded — the counter still
  // issues no second query (US-04.3, US-29.5). It is the balance as it stands *now*, so a hand-out
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
      group: customer.group,
      grownUps: allowance.grownUps,
      children: allowance.children,
      priceCents: allowance.priceCents,
      eggs: allowance.eggs,
      certificateValidUntil: customer.details.certificate.validUntil,
      status: customer.status,
      blockReason: customer.blockReason,
      reminderCount: customer.reminderCount,
      consecutiveNoShows,
      notes: customer.details.notes,
      cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
      countsOnCard: customer.card.countsAtIssue,
      groupOnCard: customer.card.groupAtIssue,
      balanceCents,
      amountToPayCents: amountToPay(allowance.priceCents, balanceCents),
      staleCard: staleCardReason(
        { counts: customer.card.countsAtIssue, group: customer.card.groupAtIssue },
        {
          counts: { grownUps: allowance.grownUps, children: allowance.children },
          group: customer.group,
        },
      ),
    },
  };
}
