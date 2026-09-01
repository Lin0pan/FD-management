/**
 * Browse and search the customer register (US-15.1).
 *
 * This is the view that replaces the spreadsheet. Away from the counter, staff answer questions the
 * lookup cannot — who is in the Red group, whose certificate lapses next month, who is blocked, how
 * balanced the two groups are — and in Excel every one of them was a filter. Nothing here is new
 * business logic: the filters are `WHERE` clauses and every column of every row is derived through
 * the same seams the counter reads, so the list can never tell a different story from the record it
 * links to.
 *
 * It is a **read**, exhaustively. No status is touched, no card is issued and there is deliberately
 * no audit entry, because nothing changed (PRD FR-7). The one decision the use case makes on its own
 * is which statuses to show: archived households stay out until somebody asks for them.
 */

import { counterQueryOrNull, formatCardNumber } from "@/domain/card/cardNumber";
import {
  certificateState,
  validUntilRangeFor,
  type CertificateState,
} from "@/domain/customer/certificate";
import type { CustomerStatus, RegisteredCustomer } from "@/domain/customer/customer";
import { groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import type { Cents } from "@/domain/money";
import { describeAllowances, type Allowance } from "../allowance/describe-allowance";
import type { Clock, CustomerListSearch, CustomerRepository, SettingsRepository } from "../ports";

export interface ListCustomersDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** Every status the list shows when nobody has narrowed it — archived rows are removed after. */
const ALL_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED", "ARCHIVED"];

/**
 * What staff asked the list for. Every field is optional: the bare call is "show me the register",
 * which is what the screen opens on.
 */
export interface ListCustomersInput {
  /**
   * The single search box: a name, a customer number or a card number. Which of the three it is is
   * read here rather than asked of the staff member — one box is what the spreadsheet had, and
   * choosing the right one of three would be a decision about the software rather than the customer.
   */
  readonly search?: string;
  /** The statuses to show. Absent or empty means "do not filter by status". */
  readonly status?: ReadonlyArray<CustomerStatus>;
  readonly group?: Group;
  readonly certificate?: CertificateState;
  /**
   * Whether households that have left the register are shown. **Defaults to false**: the list is a
   * working view of who DF serves, and an archived household turning up in it invites a second
   * registration of someone who is no longer there (US-11, FR-6). Naming `ARCHIVED` in `status` says
   * the same thing more precisely, and is honoured on its own.
   */
  readonly includeArchived?: boolean;
}

/**
 * One household as the list shows it. Every value is derived at read time — the counts from the
 * birthdates, the price from the settings in force today, the card number from the slot and the
 * current index, the certificate state from today's date. There is no stored column here that could
 * have fallen behind reality, which is precisely what the sheet could not promise.
 */
export interface CustomerListRow {
  /** The surrogate id the row links to (`/kunden/[id]`) — never the customer number. */
  readonly customerId: number;
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly group: Group;
  readonly status: CustomerStatus;
  readonly grownUps: number;
  readonly children: number;
  readonly priceCents: Cents;
  readonly certificateValidUntil: Date;
  /** Where that date stands today, so the screen states it in words rather than in colour alone. */
  readonly certificateState: CertificateState;
  readonly reminderCount: number;
  /** The number of the card the household holds today, e.g. `50k3`. */
  readonly cardNumber: string;
}

/**
 * The list, and the group balance beside it.
 *
 * `groupCounts` is deliberately **not** a count of the rows above: staff read it while registering
 * somebody (US-01) to decide which group keeps the two weeks even, and a number that moved with the
 * current filter would be a different question wearing the same label. It counts every active
 * household, always (PRD FR-3).
 */
export interface CustomerListView {
  readonly rows: ReadonlyArray<CustomerListRow>;
  readonly groupCounts: GroupCounts;
}

/**
 * How the search box's contents are read: a customer number, a card number resolved to the slot's
 * holder, or — failing both — a name.
 *
 * A card number's index is dropped on purpose. The list is about households, and `50k1` typed for a
 * household now holding `50k3` still means that household; whether the card presented is the current
 * one is the counter's question (US-04.1), not this screen's.
 */
function readSearch(typed: string | undefined): CustomerListSearch | undefined {
  const text = typed?.trim() ?? "";
  if (text === "") {
    return undefined;
  }
  const number = counterQueryOrNull(text);
  return number === null
    ? { kind: "NAME", name: text }
    : { kind: "CUSTOMER_NUMBER", customerNumber: number.customerNumber };
}

/**
 * The statuses the query will ask for.
 *
 * An absent or empty status filter is not a filter — unticking every box means "all of them", not
 * "none of them", which is the only reading that cannot leave staff staring at an empty screen they
 * did not ask for. Archived households are then taken back out unless they were named explicitly or
 * `includeArchived` asked for them.
 */
function statusesFor(input: ListCustomersInput): ReadonlyArray<CustomerStatus> {
  const asked = input.status === undefined || input.status.length === 0 ? undefined : input.status;
  const wantsArchived = input.includeArchived === true || (asked?.includes("ARCHIVED") ?? false);
  return (asked ?? ALL_STATUSES).filter((status) => status !== "ARCHIVED" || wantsArchived);
}

/**
 * The customers matching what staff asked for, lowest customer number first, with the group balance.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect by today — a register cannot be
 *   priced before DF has said what a distribution costs (US-14).
 */
export async function listCustomers(
  deps: ListCustomersDeps,
  input: ListCustomersInput,
): Promise<CustomerListView> {
  const today = deps.clock.now();
  // One instant for the whole list: the filter, the counts and the certificate labels are all
  // answered as of the same moment, so no two rows can be described on different days.
  const [found, groupCounts] = await Promise.all([
    deps.customers.list({
      statuses: statusesFor(input),
      search: readSearch(input.search),
      group: input.group,
      certificate:
        input.certificate === undefined ? undefined : validUntilRangeFor(input.certificate, today),
    }),
    deps.customers.groupCounts(),
  ]);

  // One allowance per household, in the order the households were handed over — so the settings
  // history is read once for the whole screen rather than once per row.
  const allowances = await describeAllowances(
    deps,
    found.map((customer) => customer.details.householdMembers),
    today,
  );
  // The order the repository answered in is the list's order (FR-6); nothing here re-sorts it.
  return {
    groupCounts,
    rows: found.map((customer, index) => toRow(customer, allowances[index], today)),
  };
}

/** One loaded customer as the list shows them. */
function toRow(customer: RegisteredCustomer, allowance: Allowance, today: Date): CustomerListRow {
  return {
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    group: groupOf(customer.customerNumber),
    status: customer.status,
    grownUps: allowance.grownUps,
    children: allowance.children,
    priceCents: allowance.priceCents,
    certificateValidUntil: customer.details.certificate.validUntil,
    certificateState: certificateState(customer.details.certificate, today),
    reminderCount: customer.reminderCount,
    cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
  };
}
