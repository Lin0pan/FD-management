/**
 * Browse and search the customer register (US-15.1) — the view that replaces the spreadsheet.
 *
 * No new business logic: the filters are `WHERE` clauses, and every column is derived through the
 * same seams the counter reads, so the list cannot tell a different story from the record it links
 * to. A **read** throughout, with no audit entry, because nothing changed (PRD FR-7).
 */

import { startOfUtcDay } from "@/domain/calendarDay";
import { counterQueryOrNull, formatCardNumber } from "@/domain/card/cardNumber";
import {
  certificateState,
  endingBefore,
  validUntilRangeFor,
  type CertificateState,
  type ValidUntilRange,
} from "@/domain/customer/certificate";
import type { CustomerStatus, RegisteredCustomer } from "@/domain/customer/customer";
import { countByGroup, groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type { Cents } from "@/domain/money";
import { describeAllowances, type Allowance } from "../allowance/describe-allowance";
import type {
  Clock,
  CustomerListSearch,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";

export interface ListCustomersDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: Pick<DistributionRecordRepository, "latestHandoutByCustomer">;
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
   * The single search box: a name, a customer number or a card number. Which of the three is read
   * here rather than asked — choosing between three boxes would be a decision about the software.
   */
  readonly search?: string;
  /** The statuses to show. Absent or empty means "do not filter by status". */
  readonly status?: ReadonlyArray<CustomerStatus>;
  /**
   * Show one week's households only — the one criterion the **use case** applies rather than the
   * store, because a group is the parity of a number (ADR-017) and SQLite has no `% 2` in a `WHERE`.
   * The register is bounded by the quota, so this never narrows more than `quotaN` rows.
   */
  readonly group?: Group;
  readonly certificate?: CertificateState;
  /**
   * Households whose latest hand-out fell on a day strictly before this one. A household never
   * served has no such day and is never kept — „not since" is not „never" (US-46.1).
   */
  readonly lastHandoutBefore?: Date;
  /** Households whose certificate ends strictly before this day; it counts on its last day. */
  readonly certificateEndsBefore?: Date;
  /**
   * Households with exactly one of these numbers of grown-ups, as of today. Absent means „not
   * filtered", but **an empty list matches nothing**: unlike `status`, it is staff unticking every
   * box, and an empty table is the answer they asked for (US-46.2).
   */
  readonly grownUps?: ReadonlyArray<number>;
  /** The same for the number of children, empty likewise matching nothing. */
  readonly children?: ReadonlyArray<number>;
  /**
   * Whether households that have left are shown. **Defaults to false**: an archived household turning
   * up invites a second registration of someone no longer there (US-11, FR-6). Naming `ARCHIVED` in
   * `status` says the same more precisely and is honoured on its own.
   */
  readonly includeArchived?: boolean;
}

/**
 * One household as the list shows it, every value derived at read time — no stored column here could
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
  /** The household's latest hand-out, the running session's included, or `null` before their first. */
  readonly lastHandoutAt: Date | null;
}

/**
 * The list, and the group balance beside it.
 *
 * `groupCounts` is deliberately **not** a count of the rows above: staff read it while deciding which
 * group keeps the two weeks even, and a number moving with the filter would be a different question
 * wearing the same label. It always counts every active household (PRD FR-3, ADR-017).
 */
export interface CustomerListView {
  readonly rows: ReadonlyArray<CustomerListRow>;
  readonly groupCounts: GroupCounts;
  /**
   * The numbers of grown-ups that occur, ascending — the boxes staff can tick. Taken over the
   * households the list could show at all (archived ones only when `includeArchived`), never
   * narrowed by the other filters, and always holding any number the request itself named, so a
   * filter in force is one staff can see and undo (US-46.2).
   */
  readonly grownUpCounts: ReadonlyArray<number>;
  /** The same for the number of children. */
  readonly childCounts: ReadonlyArray<number>;
}

/**
 * How the search box is read: a customer number, a card number resolved to the slot's holder, or a
 * name. The card index is dropped — the list is about households, and whether the card presented is
 * current is the counter's question (US-04.1).
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
 * The statuses the query asks for. An absent or empty filter means "all of them", not "none" — the
 * only reading that cannot leave staff staring at an empty screen. Archived households are then taken
 * back out unless they were named or `includeArchived` asked for them.
 */
function statusesFor(input: ListCustomersInput): ReadonlyArray<CustomerStatus> {
  const asked = input.status === undefined || input.status.length === 0 ? undefined : input.status;
  const wantsArchived = input.includeArchived === true || (asked?.includes("ARCHIVED") ?? false);
  return (asked ?? ALL_STATUSES).filter((status) => status !== "ARCHIVED" || wantsArchived);
}

/** The `validUntil` range the store is asked for: the certificate state, cut at the end day. */
function certificateRangeFor(input: ListCustomersInput, today: Date): ValidUntilRange | undefined {
  const state =
    input.certificate === undefined ? undefined : validUntilRangeFor(input.certificate, today);
  return input.certificateEndsBefore === undefined
    ? state
    : endingBefore(state, input.certificateEndsBefore);
}

/** Whether `count` passes a count filter: absent passes everything, empty passes nothing. */
function countMatches(asked: ReadonlyArray<number> | undefined, count: number): boolean {
  return asked === undefined || asked.includes(count);
}

/** The distinct numbers among `occurring` and `asked`, ascending. */
function distinctAscending(
  occurring: ReadonlyArray<number>,
  asked: ReadonlyArray<number> = [],
): ReadonlyArray<number> {
  return [...new Set([...occurring, ...asked])].sort((a, b) => a - b);
}

/** Whether a latest hand-out lies before midnight UTC of `dayStart`; never if there is none. */
function servedBefore(lastHandoutAt: Date | undefined, dayStart: Date): boolean {
  return lastHandoutAt !== undefined && lastHandoutAt.getTime() < dayStart.getTime();
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
  // One instant for the whole list, so no two rows can be described on different days.
  const [matched, register, takenNumbers, latestHandouts] = await Promise.all([
    deps.customers.list({
      statuses: statusesFor(input),
      search: readSearch(input.search),
      certificate: certificateRangeFor(input, today),
    }),
    // What the count boxes offer, read off the register rather than off `matched`, so a filter in
    // force never takes its own way back out of the list (`CustomerListView.grownUpCounts`).
    deps.customers.list({ statuses: statusesFor({ includeArchived: input.includeArchived }) }),
    deps.customers.takenActiveNumbers(),
    deps.records.latestHandoutByCustomer(),
  ]);
  // The group is narrowed here and nowhere else, for the reason `ListCustomersInput.group` gives.
  // The latest hand-out is too: it is the map the column already reads, not a column of the row.
  const lastHandoutBefore =
    input.lastHandoutBefore === undefined ? undefined : startOfUtcDay(input.lastHandoutBefore);
  // So are the counts, which only exist once the birthdates are read against today.
  const found = matched.filter((customer) => {
    const counts = composition(customer.details.householdMembers, today);
    return (
      (input.group === undefined || groupOf(customer.customerNumber) === input.group) &&
      (lastHandoutBefore === undefined ||
        servedBefore(latestHandouts.get(customer.id), lastHandoutBefore)) &&
      countMatches(input.grownUps, counts.grownUps) &&
      countMatches(input.children, counts.children)
    );
  });
  const occurring = register.map((customer) =>
    composition(customer.details.householdMembers, today),
  );
  // Off the numbers the register holds, never off `found` — see `CustomerListView.groupCounts`.
  const groupCounts = countByGroup(takenNumbers);

  // In the order the households were handed over, so the settings history is read once for the whole
  // screen rather than once per row.
  const allowances = await describeAllowances(
    deps,
    found.map((customer) => customer.details.householdMembers),
    today,
  );
  // The order the repository answered in is the list's order (FR-6); nothing here re-sorts it.
  return {
    groupCounts,
    grownUpCounts: distinctAscending(
      occurring.map((counts) => counts.grownUps),
      input.grownUps,
    ),
    childCounts: distinctAscending(
      occurring.map((counts) => counts.children),
      input.children,
    ),
    rows: found.map((customer, index) =>
      toRow(customer, allowances[index], latestHandouts.get(customer.id) ?? null, today),
    ),
  };
}

/** One loaded customer as the list shows them. */
function toRow(
  customer: RegisteredCustomer,
  allowance: Allowance,
  lastHandoutAt: Date | null,
  today: Date,
): CustomerListRow {
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
    lastHandoutAt,
  };
}
