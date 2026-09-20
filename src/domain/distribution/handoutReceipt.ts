/**
 * The receipt of who stood at the counter: the household as it was when the afternoon was closed
 * (US-35, ADR-021). A snapshot in the sense `IssuedCard.countsAtIssue` is, and to be read as one —
 * never as the household's current name, number or counts, which are the customer's own row.
 *
 * It exists because two of these values cannot be reconstructed at all: editing a household
 * overwrites the names and replaces the member rows (US-16, FR-2).
 *
 * **The group is not among them.** It is `groupOf(customerNumber)` of the captured number
 * (ADR-017), derived wherever it is shown, because a column here would be free to disagree with the
 * number beside it. **The card number is not either**, for the same reason: it is
 * `formatCardNumber(cardCustomerNumber, cardIndex)` over the two integers a card itself stores.
 */

import type { IssuedCard } from "../card/card";
import { composition, type HouseholdMember } from "../customer/householdComposition";

/** The details one hand-out carries about the household that collected, as they stood then. */
export interface HandoutReceipt {
  /**
   * The slot the household held that afternoon — and with it the week they collected in, since the
   * group is the parity of the number (`groupOf`, ADR-017).
   */
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly grownUps: number;
  readonly children: number;
  /**
   * The slot the card they carried was **printed under**, which a move leaves behind (ADR-016), so
   * it may differ from {@link customerNumber} above.
   */
  readonly cardCustomerNumber: number;
  readonly cardIndex: number;
  readonly certificateValidUntil: Date;
  readonly reminderCount: number;
}

/** A household reduced to the fields a receipt reads off it, as the register holds them. */
export interface ReceiptHousehold {
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly certificateValidUntil: Date;
  readonly reminderCount: number;
}

/** Everything a receipt is read off: the household, its members, the card it holds, the instant. */
export interface ReceiptInput {
  readonly customer: ReceiptHousehold;
  /** The household's rows, from which the counts are derived — never a stored count. */
  readonly members: ReadonlyArray<HouseholdMember>;
  /**
   * The card the household holds. Only its two numbers are taken: what was *printed* on it
   * (`countsAtIssue`) is what the card claimed, while the receipt records what was true.
   */
  readonly card: Pick<IssuedCard, "customerNumber" | "index">;
  /** The instant the session was ended — the moment the whole receipt is true of. */
  readonly at: Date;
}

/**
 * The receipt for one hand-out, read off the register as it stands at `at`.
 *
 * @throws {EmptyHousehold} if the household has no members.
 * @throws {BirthDateInFuture} if a member was born after `at`.
 */
export function receiptFor({ customer, members, card, at }: ReceiptInput): HandoutReceipt {
  const counts = composition(members, at);

  return {
    customerNumber: customer.customerNumber,
    firstName: customer.firstName,
    lastName: customer.lastName,
    grownUps: counts.grownUps,
    children: counts.children,
    cardCustomerNumber: card.customerNumber,
    cardIndex: card.index,
    certificateValidUntil: customer.certificateValidUntil,
    reminderCount: customer.reminderCount,
  };
}
