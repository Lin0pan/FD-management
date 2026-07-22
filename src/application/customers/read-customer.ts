/**
 * Read one customer as their card view shows them.
 *
 * Everything derivable is derived here and handed to the screen ready to render — the household
 * counts from the birthdates and the card number from the slot and the card index. The page then has
 * nothing left to work out, which is what keeps the rules out of the presentation layer.
 */

import { formatCardNumber } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import { composition, type HouseholdComposition } from "@/domain/customer/householdComposition";
import { CustomerNotFound } from "@/domain/errors";
import type { Clock, CustomerRepository } from "../ports";

export interface ReadCustomerDeps {
  readonly customers: CustomerRepository;
  readonly clock: Clock;
}

export interface CustomerCardView {
  readonly customer: RegisteredCustomer;
  /** Derived from the birthdates as of today — never read from a stored count, which there is none of. */
  readonly composition: HouseholdComposition;
  /** The number printed on the card, e.g. `12k1`. Derived from the slot and the card index. */
  readonly cardNumber: string;
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

  return {
    customer,
    composition: composition(customer.details.householdMembers, deps.clock.now()),
    cardNumber: formatCardNumber(customer.customerNumber, customer.card.index),
  };
}
