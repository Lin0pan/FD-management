/**
 * The counter verdict: may this person collect today, and if not, why not (US-04.1). One pure
 * function returning exactly one verdict, so the answer cannot drift between screens — assembling it
 * in JSX is the mistake this module exists to prevent (`tasks/prd-us-04-lookup-customer.md` §7).
 *
 * The precedence is fixed and total: `NOT_FOUND` → `ARCHIVED` → `BLOCKED` → `WRONG_GROUP` →
 * `OUTDATED_CARD` → `ALREADY_SERVED` → certificate → `CLEAR_TO_SERVE`. The earlier reason wins,
 * being the more specific fact. An **expired certificate never blocks** — it is a serve-and-remind
 * case (US-06), since chasing a renewal is a conversation, not grounds to refuse food.
 *
 * **The write path ranks the same two facts the other way round, deliberately.** This answers *may
 * they collect*, so a blocked household that already collected reads `BLOCKED`. `recordAttendance`
 * answers *may this write happen* and checks `canRecord` first, so the same household is refused
 * there with `AlreadyServedInSession` — the more specific fact about a second `POST` (US-32.5,
 * `docs/architecture/06-runtime-view.md`). Neither order is the other's bug.
 */

import type { CardNumber } from "../card/cardNumber";
import type { CustomerStatus } from "../customer/customer";
import type { Group } from "../customer/group";
import { servesGroup, type SessionGroups } from "./session";
import { startOfUtcDay } from "./weekColour";

/**
 * A customer reduced to the fields the verdict turns on, derived by the application layer — the
 * current card index off the run, not a flag — so the rule never touches persistence.
 */
export interface CounterCustomer {
  readonly customerNumber: number;
  readonly status: CustomerStatus;
  /**
   * The week this household collects in — `groupOf(customerNumber)` (ADR-017), passed in rather than
   * derived here so the rule stays about the verdict.
   */
  readonly group: Group;
  /**
   * The reason recorded when the customer was blocked (US-08), or `null`. A block cannot be saved
   * without one, so `null` means "not blocked" — which the status decides before this is read.
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
  /** The card index presented, or `null` for a bare customer number, which means the current card. */
  readonly presentedCardIndex: number | null;
  /** The calendar day the lookup happens on — read by the certificate check alone. */
  readonly today: Date;
  /**
   * The group(s) the running session serves (US-34). A household's own week decides nothing here.
   */
  readonly sessionGroups: SessionGroups;
  /**
   * Whether a hand-out is already recorded for this household in the running session — a **fact**,
   * never the record, so the rule knows nothing about `DistributionRecord`.
   */
  readonly servedInSession: boolean;
}

/**
 * Exactly one outcome of a counter lookup. A discriminated union so the UI switch can be made
 * exhaustive — adding a case is a compile error until every screen renders it (US-04.4, §7).
 */
export type Verdict =
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "ARCHIVED" }
  | { readonly kind: "BLOCKED"; readonly reason: string | null }
  | { readonly kind: "WRONG_GROUP"; readonly group: Group; readonly sessionGroups: SessionGroups }
  | { readonly kind: "OUTDATED_CARD"; readonly presented: CardNumber; readonly current: CardNumber }
  | { readonly kind: "ALREADY_SERVED" }
  | { readonly kind: "CLEAR_TO_SERVE" }
  | {
      readonly kind: "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED";
      readonly validUntil: Date;
      readonly reminderCount: number;
    };

/**
 * Whether a certificate has lapsed by `today`. Compared as calendar days — a certificate is valid
 * *through* its last day — so the verdict cannot turn on the time a record was entered.
 */
export function certificateExpired(validUntil: Date, today: Date): boolean {
  return startOfUtcDay(validUntil).getTime() < startOfUtcDay(today).getTime();
}

/**
 * The one verdict for a customer at the counter, by the precedence documented above.
 *
 * @returns exactly one {@link Verdict}; never throws — an unassigned slot is `NOT_FOUND`.
 */
export function evaluateAtCounter(input: CounterInput): Verdict {
  const { customer, presentedCardIndex, today, sessionGroups, servedInSession } = input;

  if (customer === null) {
    return { kind: "NOT_FOUND" };
  }
  if (customer.status === "ARCHIVED") {
    return { kind: "ARCHIVED" };
  }
  if (customer.status === "BLOCKED") {
    return { kind: "BLOCKED", reason: customer.blockReason };
  }
  // A session serving both groups can never reach this — which is what makes a merged afternoon
  // one session rather than two.
  if (!servesGroup(sessionGroups, customer.group)) {
    return { kind: "WRONG_GROUP", group: customer.group, sessionGroups };
  }
  if (presentedCardIndex !== null && presentedCardIndex < customer.currentCardIndex) {
    return {
      kind: "OUTDATED_CARD",
      presented: { customerNumber: customer.customerNumber, index: presentedCardIndex },
      current: { customerNumber: customer.customerNumber, index: customer.currentCardIndex },
    };
  }
  if (servedInSession) {
    return { kind: "ALREADY_SERVED" };
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
