/**
 * The numbers a household may be moved to, each with the card number it would print (US-30).
 *
 * The record's number control is a choice between slots, and every one of them prints a *different*
 * card number — the index counts the slot's whole run, archived holders included (US-25), so what a
 * move hands the household over the counter depends on which slot they land on. The confirmation
 * therefore has to name the card **before** anything is written, and it can only do that if the
 * choices arrive with their card numbers already worked out.
 *
 * **One reading of the register per call.** The free numbers and the runs on every slot are read
 * together, so the number offered and the card number beside it cannot come from two different
 * moments — the same argument `proposeRegistration` makes for deriving the number the form opens on
 * from the pool it offers rather than asking twice.
 *
 * It is a **proposal**, not a reservation, exactly as `proposeRegistration` is: nothing is held,
 * and `changeCustomerNumber` decides again when the form is saved. The partial unique index on
 * `Customer`, not this reading, is the authority on a free slot. That is also why this use case is
 * what a **refusal** re-reads — after losing the race for a number the form has to go on offering
 * a list that is up to date, or the staff member's obvious next move fails identically (the shape
 * `freshPoolAfterRace` established for registration, US-24).
 *
 * The quota is read here rather than taken from the caller, so a screen that was open while staff
 * lowered it (US-14) cannot go on offering slots that are no longer slots. That is a second reading
 * of the settings history on a record that already read it for the prices — deliberately, because
 * the two questions are different ones and threading a `Settings` through the boundary to save one
 * query on a four-user application would be the worse trade.
 */

import { formatCardNumber, nextCardIndexOnMove } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import { choosableNumbers } from "@/domain/customer/customerNumber";
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
   * The card number a move onto this slot would print, e.g. `23k6`. It is the *later* of the two
   * runs (`nextCardIndexOnMove`): the slot's history decides it in the ordinary case, and the
   * household's own card decides it where the slot has been round fewer times.
   *
   * On the household's **own** number it is what a reissue would print, which is what a move that
   * changed nothing would have to be — but that move is refused (`CustomerNumberUnchanged`), so
   * nothing here ever prints it.
   */
  readonly nextCardNumber: string;
}

/**
 * Every number `customer` may be moved to, ascending, each with the card number it would print.
 *
 * An **archived** household gets an empty list and neither store is asked: they hold no slot to
 * move out of, so there is nothing to offer. A statement about meaning rather than a saving.
 *
 * @throws {NoSettingsInForce} if no settings version has taken effect — a database that was never
 *   seeded is a setup failure, not a reason to invent a quota.
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
    // A slot missing from the map has never had a card, and `0` is what says so — the same value
    // `highestIndexForNumber` answers with, so a fresh slot needs no case of its own here either.
    nextCardNumber: formatCardNumber(
      number,
      nextCardIndexOnMove(highestByNumber.get(number) ?? 0, customer.card.index),
    ),
  }));
}
