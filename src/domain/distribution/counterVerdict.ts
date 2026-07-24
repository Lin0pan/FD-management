/**
 * The counter verdict — the single answer a staff member reads when a customer reaches the front of
 * the queue: may this person collect today, and if not, why not (US-04.1).
 *
 * Today the same judgement is assembled by eye from several spreadsheet columns under time pressure.
 * Here it is **one pure function** returning exactly one verdict, so every branch is unit-tested in
 * milliseconds and the answer cannot drift between the counter screen and any other view that shows
 * it. Assembling the verdict in JSX is the mistake this module exists to prevent
 * (tasks/prd-us-04-lookup-customer.md §7).
 *
 * The precedence is fixed and total: `NOT_FOUND` → `ARCHIVED` → `BLOCKED` → `WRONG_GROUP` →
 * `OUTDATED_CARD` → certificate check → `CLEAR_TO_SERVE`. An earlier reason always wins, so a blocked
 * customer in the wrong group is turned away as *blocked* — the more specific fact about them — rather
 * than sent to come back next week. An **expired certificate never blocks**: it is a serve-and-remind
 * case (US-06), because chasing a renewal is a conversation at the counter, not grounds to refuse food.
 *
 * The module is pure: `today` and `weekColour` are parameters, never the wall clock, and it does no
 * I/O — the application layer resolves the typed number to a {@link CounterCustomer} first (US-04.2).
 */

import type { CardNumber } from "../card/cardNumber";
import type { CustomerStatus } from "../customer/customer";
import type { Group } from "../customer/group";
import type { WeekColour } from "../policy/settings";
import { startOfUtcDay } from "./weekColour";

/**
 * A customer reduced to the fields the counter verdict turns on. The application layer derives this
 * from the stored record — the current card index from the card run, not a flag — and passes it in,
 * so the rule never touches persistence.
 */
export interface CounterCustomer {
  readonly customerNumber: number;
  readonly status: CustomerStatus;
  readonly group: Group;
  /**
   * The reason recorded when the customer was blocked (US-08), or `null` when they are not blocked.
   * A blocked customer always carries one — the block cannot be saved without it — so `null` here
   * means "not blocked", which the status decides before the reason is ever read.
   */
  readonly blockReason: string | null;
  /** The index of the highest card ever issued — the one card that is currently valid (US-02, FR-4). */
  readonly currentCardIndex: number;
  /** The day the needs certificate lapses. An expired one prompts a reminder, never a refusal. */
  readonly certificateValidUntil: Date;
  /** How many certificate reminders have already been handed out (US-06). */
  readonly reminderCount: number;
}

/** Everything the rule needs: the resolved customer, the card presented, and the day it happens on. */
export interface CounterInput {
  /** The customer the typed number resolved to, or `null` when the slot is unassigned. */
  readonly customer: CounterCustomer | null;
  /**
   * The card index the staff member presented, or `null` when they typed a bare customer number.
   * Only a presented index can be *outdated*: a bare number always means the current card.
   */
  readonly presentedCardIndex: number | null;
  /** The calendar day the lookup happens on. */
  readonly today: Date;
  /** The colour of the week `today` falls in (US-03). */
  readonly weekColour: WeekColour;
}

/**
 * Exactly one outcome of a counter lookup. A discriminated union so the UI switch can be made
 * exhaustive — adding a case becomes a compile error until every screen renders it (US-04.4, §7).
 *
 * `ALREADY_SERVED_TODAY` is declared here for US-05's duplicate-prevention to return; the read-only
 * lookup never produces it, because "already served" is a fact of the day's distribution record
 * rather than of the customer, and this rule takes no such record.
 */
export type Verdict =
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "ARCHIVED" }
  | { readonly kind: "BLOCKED"; readonly reason: string | null }
  | { readonly kind: "WRONG_GROUP"; readonly group: Group; readonly weekColour: WeekColour }
  | { readonly kind: "OUTDATED_CARD"; readonly presented: CardNumber; readonly current: CardNumber }
  | { readonly kind: "ALREADY_SERVED_TODAY" }
  | { readonly kind: "CLEAR_TO_SERVE" }
  | {
      readonly kind: "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED";
      readonly validUntil: Date;
      readonly reminderCount: number;
    };

/**
 * Whether a certificate valid until `validUntil` has lapsed by `today`. Both are compared as calendar
 * days — a certificate is valid *through* its last day, whatever the time written on either value, so
 * the same comparison the age rule uses (`householdComposition`) keeps the verdict from turning on the
 * time of day a record happened to be entered.
 */
function certificateExpired(validUntil: Date, today: Date): boolean {
  return startOfUtcDay(validUntil).getTime() < startOfUtcDay(today).getTime();
}

/**
 * The one verdict for a customer at the counter, by the fixed precedence documented above.
 *
 * @returns exactly one {@link Verdict}; never throws — an unassigned slot is `NOT_FOUND`, not an error.
 */
export function evaluateAtCounter(input: CounterInput): Verdict {
  const { customer, presentedCardIndex, today, weekColour } = input;

  if (customer === null) {
    return { kind: "NOT_FOUND" };
  }
  if (customer.status === "ARCHIVED") {
    return { kind: "ARCHIVED" };
  }
  if (customer.status === "BLOCKED") {
    return { kind: "BLOCKED", reason: customer.blockReason };
  }
  if (customer.group !== weekColour) {
    return { kind: "WRONG_GROUP", group: customer.group, weekColour };
  }
  if (presentedCardIndex !== null && presentedCardIndex < customer.currentCardIndex) {
    return {
      kind: "OUTDATED_CARD",
      presented: { customerNumber: customer.customerNumber, index: presentedCardIndex },
      current: { customerNumber: customer.customerNumber, index: customer.currentCardIndex },
    };
  }
  if (certificateExpired(customer.certificateValidUntil, today)) {
    return {
      kind: "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
      validUntil: customer.certificateValidUntil,
      reminderCount: customer.reminderCount,
    };
  }
  return { kind: "CLEAR_TO_SERVE" };
}
