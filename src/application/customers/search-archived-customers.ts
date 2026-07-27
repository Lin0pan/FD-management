/**
 * Search the archive for a returning applicant (US-11.1).
 *
 * People come back. FD already knows their household, and retyping it wastes time and invents typos,
 * so registration starts by asking whether this person has been here before. What comes back is a
 * *read* and nothing more: the rows it names are archived, and the registration it feeds creates a
 * new customer rather than reviving one (US-11.3). Nothing here writes, and there is deliberately no
 * audit entry — no state changed.
 *
 * Only archived households are searched. An active one turning up would invite a second registration
 * of someone who already holds a slot (PRD FR-6), and the "are they already registered" question is
 * the counter lookup's (US-04), not this screen's.
 *
 * The search takes no clock: household *size* is the number of people on the record, not a count of
 * grown-ups and children, so nothing here depends on the day it is asked. The counts staff act on are
 * derived at registration as they always are.
 */

import type { Address } from "@/domain/customer/customer";
import { EmptySearchQuery } from "@/domain/errors";
import type { ArchivedCustomer, ArchiveSearchQuery, CustomerRepository } from "../ports";

/**
 * How many matches the screen shows.
 *
 * Beyond this the answer is "say more about who you mean", not another page: the list exists to be
 * recognised at a glance, and a staff member paging through archived households is a staff member
 * about to pre-fill a registration from the wrong row (PRD §US-11.1). Twenty is comfortably more than
 * any real name produces in a register of ~240 households.
 */
export const MAX_ARCHIVE_SEARCH_RESULTS = 20;

/** The criteria a search may be narrowed by — named on the refusal when none of them was given. */
const SEARCH_CRITERIA = ["lastName", "firstName", "birthDate"] as const;

export interface SearchArchivedCustomersDeps {
  readonly customers: CustomerRepository;
}

/**
 * What staff typed. Each field is optional, but at least one must carry something: a name is trimmed
 * before it counts, so a stray space is not a criterion.
 */
export interface SearchArchivedCustomersInput {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly birthDate?: Date;
}

/**
 * One archived household as the search lists it — enough to tell two people of the same name apart,
 * and no more. It is not the record: the pre-fill reads the record itself by id (US-11.2).
 */
export interface ArchivedCustomerMatch {
  /** The surrogate id of the archived record — what the pre-fill is asked for. */
  readonly customerId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
  /** How many people the household had on record — derived from the members, never stored. */
  readonly householdSize: number;
  /**
   * The number this household held before they were archived. Shown for recognition only: the slot
   * was freed the moment they left and may already be someone else's, so a re-registration allocates
   * a number afresh and never this one (US-11.3, FR-3).
   */
  readonly formerCustomerNumber: number;
  readonly archivedAt: Date;
  /** Why they were archived, verbatim — it may be exactly what staff need to read (PRD §6). */
  readonly archiveReason: string;
}

/**
 * The matches, and whether the register held more of them than the screen shows.
 *
 * `truncated` is the whole of what "there are more" means here — no count and no cursor. A number
 * would invite staff to page towards it, and the answer to a list this long is a narrower search.
 */
export interface ArchiveSearchResult {
  readonly matches: ReadonlyArray<ArchivedCustomerMatch>;
  readonly truncated: boolean;
}

/**
 * The trimmed criterion, or `undefined` when nothing was typed into it. A blank field is not a
 * search for the empty name — it is a field the staff member left alone.
 */
function criterion(value: string | undefined): string | undefined {
  const text = value?.trim() ?? "";
  return text === "" ? undefined : text;
}

/** One archived record reduced to what the result list shows. */
function toMatch(customer: ArchivedCustomer): ArchivedCustomerMatch {
  return {
    customerId: customer.id,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    birthDate: customer.details.birthDate,
    address: customer.details.address,
    householdSize: customer.details.householdMembers.length,
    formerCustomerNumber: customer.customerNumber,
    archivedAt: customer.archivedAt,
    archiveReason: customer.archiveReason,
  };
}

/**
 * Find archived households matching every criterion given, most recently archived first.
 *
 * @throws {EmptySearchQuery} if no criterion was given. Listing the whole archive would be a page
 *   staff scroll through looking for a household they could have named — and picking the wrong row
 *   out of it is the one mistake this feature must not make.
 */
export async function searchArchivedCustomers(
  deps: SearchArchivedCustomersDeps,
  input: SearchArchivedCustomersInput,
): Promise<ArchiveSearchResult> {
  const query: ArchiveSearchQuery = {
    lastName: criterion(input.lastName),
    firstName: criterion(input.firstName),
    birthDate: input.birthDate,
  };
  if (
    query.lastName === undefined &&
    query.firstName === undefined &&
    query.birthDate === undefined
  ) {
    throw new EmptySearchQuery([...SEARCH_CRITERIA]);
  }

  // One more than the screen shows, which is how "there are more" is learned without a second count:
  // the extra row is never displayed, it only decides `truncated`.
  const found = await deps.customers.searchArchived(query, MAX_ARCHIVE_SEARCH_RESULTS + 1);
  return {
    matches: found.slice(0, MAX_ARCHIVE_SEARCH_RESULTS).map(toMatch),
    truncated: found.length > MAX_ARCHIVE_SEARCH_RESULTS,
  };
}
