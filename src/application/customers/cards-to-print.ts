/**
 * Which households hold a card that has not been printed yet — DF handed over a temporary one and
 * print the real one later (US-39.4). Nothing changes at the counter: such a card is valid (D11).
 */

import type { CardIssueReason } from "@/domain/card/card";
import { formatCardNumber } from "@/domain/card/cardNumber";
import type { CustomerRepository } from "../ports";
import type { CardPrintInput } from "./mark-card-printed";

export interface CardsToPrintDeps {
  readonly customers: CustomerRepository;
}

/** One household whose current card is still to be printed. */
export interface CardToPrint {
  readonly customerId: number;
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly blocked: boolean;
  /** The card's index, which the tick-off is written against with `customerId` (D4). */
  readonly index: number;
  /** The card's own number, off the slot it was printed under (ADR-016). */
  readonly cardNumber: string;
  readonly issuedAt: Date;
  readonly reason: CardIssueReason;
}

/**
 * The households whose current card is not yet printed, the longest-waiting first and ties by
 * customer number. Active and blocked both: a blocked household still holds its card and slot, an
 * archived one does neither (D6). The read model carries the current card alone, so a replaced
 * card is never listed (D4).
 */
export async function listCardsToPrint(
  deps: CardsToPrintDeps,
): Promise<ReadonlyArray<CardToPrint>> {
  const [active, blocked] = await Promise.all([
    deps.customers.listWithStatus("ACTIVE"),
    deps.customers.listWithStatus("BLOCKED"),
  ]);

  return [...active, ...blocked]
    .filter((customer) => customer.card.printedAt === null)
    .map((customer): CardToPrint => ({
      customerId: customer.id,
      customerNumber: customer.customerNumber,
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      blocked: customer.status === "BLOCKED",
      index: customer.card.index,
      cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
      issuedAt: customer.card.issuedAt,
      reason: customer.card.reason,
    }))
    .sort(
      (a, b) => a.issuedAt.getTime() - b.issuedAt.getTime() || a.customerNumber - b.customerNumber,
    );
}

/**
 * How many cards are waiting — built from the list and measured, so a count can never promise a
 * row the list does not show.
 */
export async function countCardsToPrint(deps: CardsToPrintDeps): Promise<number> {
  return (await listCardsToPrint(deps)).length;
}

/** The card a tick-off just recorded, named for the undo offered right after it (D7). */
export interface JustPrintedCard {
  readonly customerId: number;
  readonly index: number;
  readonly cardNumber: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * The card named by a just-made tick, or `null` unless it is still the household's current card,
 * still printed and the household not archived — the undo is offered on exactly the card
 * `undoCardPrinted` would accept. The ids come from the address bar, so anything else is no offer
 * rather than an error.
 */
export async function justPrintedCard(
  deps: CardsToPrintDeps,
  { customerId, index }: CardPrintInput,
): Promise<JustPrintedCard | null> {
  const customer = await deps.customers.findById(customerId);
  if (
    customer === null ||
    customer.status === "ARCHIVED" ||
    customer.card.index !== index ||
    customer.card.printedAt === null
  ) {
    return null;
  }
  return {
    customerId,
    index,
    cardNumber: formatCardNumber(customer.card.customerNumber, index),
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
  };
}
