/**
 * The numbers a household may be moved to, each with the card number it would print (US-30).
 *
 * Every slot prints a *different* card number, because the index counts the slot's whole run (US-25),
 * so the confirmation has to name the card **before** anything is written — which it can only do if
 * the choices arrive with their card numbers worked out.
 *
 * **One reading of the register per call**, so the number offered and the card number beside it
 * cannot come from two different moments.
 *
 * A **proposal**, not a reservation: nothing is held, `changeCustomerNumber` decides again on save,
 * and the partial unique index is the authority on a free slot. That is why a **refusal** re-reads
 * this — otherwise the staff member's obvious next move fails identically (US-24).
 *
 * The quota is read here rather than taken from the caller, so a screen open while staff lowered it
 * (US-14) cannot go on offering slots that are no longer slots.
 */

import { formatCardNumber, nextCardIndexOnMove } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import { choosableNumbers } from "@/domain/customer/customerNumber";
import { groupOf, type Group } from "@/domain/customer/group";
import type { CardRepository, Clock, CustomerRepository, SettingsRepository } from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";

export interface ListNumberChoicesDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** One slot the household may be moved to, and the card that move would print. */
export interface NumberChoice {
  /** The customer number itself — the household's own is always among them. */
  readonly number: number;
  /**
   * The week the slot collects in (ADR-017), riding on the choice so the browser filters and names it
   * without working parity out for itself — the domain's answer, not a second statement of the rule.
   */
  readonly group: Group;
  /**
   * The card number a move onto this slot would print, e.g. `23k6` — the *later* of the two runs
   * (`nextCardIndexOnMove`). On the household's **own** number it is what a reissue would print, and
   * that move is refused (`CustomerNumberUnchanged`), so nothing here ever prints it.
   */
  readonly nextCardNumber: string;
}

/**
 * Every number `customer` may be moved to, ascending, each with the card number it would print.
 *
 * An **archived** household gets an empty list and neither store is asked — they hold no slot to move
 * out of. A statement about meaning rather than a saving.
 *
 * @throws {NoSettingsInForce} if no settings version has taken effect — a setup failure, not a reason
 *   to invent a quota.
 */
export async function listNumberChoices(
  deps: ListNumberChoicesDeps,
  customer: RegisteredCustomer,
): Promise<ReadonlyArray<NumberChoice>> {
  if (customer.status === "ARCHIVED") {
    return [];
  }

  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  const [takenNumbers, highestByNumber] = await Promise.all([
    deps.customers.takenActiveNumbers(),
    deps.cards.highestIndexByNumber(),
  ]);

  return choosableNumbers(customer.customerNumber, takenNumbers, settings.quotaN).map((number) => ({
    number,
    group: groupOf(number),
    // A slot missing from the map has never had a card, and `0` says so — the value
    // `highestIndexForNumber` answers with, so a fresh slot needs no case of its own.
    nextCardNumber: formatCardNumber(
      number,
      nextCardIndexOnMove(highestByNumber.get(number) ?? 0, customer.card.index),
    ),
  }));
}
