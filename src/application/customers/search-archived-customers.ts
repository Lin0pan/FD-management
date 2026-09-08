/**
 * Search the archive for a returning applicant (US-11.1). A *read* and nothing more — the registration
 * it feeds creates a new customer rather than reviving one (US-11.3), so there is no audit entry.
 *
 * Only archived households are searched: an active one turning up would invite a second registration
 * of someone who already holds a slot (PRD FR-6).
 *
 * It takes no clock, because household *size* is a count of people on the record rather than of
 * grown-ups and children.
 */

import type { Address } from "@/domain/customer/customer";
import { EmptySearchQuery } from "@/domain/errors";
import type { ArchivedCustomer, ArchiveSearchQuery, CustomerRepository } from "../ports";

/**
 * How many matches the screen shows. Beyond this the answer is a narrower search, not another page: a
 * staff member paging through archived households is one about to pre-fill a registration from the
 * wrong row (PRD §US-11.1).
 */
export const MAX_ARCHIVE_SEARCH_RESULTS = 20;

/** The criteria a search may be narrowed by — named on the refusal when none of them was given. */
const SEARCH_CRITERIA = ["lastName", "firstName", "birthDate"] as const;

export interface SearchArchivedCustomersDeps {
  readonly customers: CustomerRepository;
}

/** What staff typed. At least one field must carry something, trimmed — a stray space is not one. */
export interface SearchArchivedCustomersInput {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly birthDate?: Date;
}

/**
 * One archived household as the search lists it — enough to tell two people of the same name apart,
 * and no more. The pre-fill reads the record itself by id (US-11.2).
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
   * The number held before archiving, shown for recognition only: the slot was freed on the way out
   * and may already be someone else's, so a re-registration allocates afresh (US-11.3, FR-3).
   */
  readonly formerCustomerNumber: number;
  readonly archivedAt: Date;
  /** Why they were archived, verbatim — it may be exactly what staff need to read (PRD §6). */
  readonly archiveReason: string;
}

/**
 * The matches, and whether the register held more than the screen shows. `truncated` is all "there
 * are more" means — a count would invite staff to page towards it.
 */
export interface ArchiveSearchResult {
  readonly matches: ReadonlyArray<ArchivedCustomerMatch>;
  readonly truncated: boolean;
}

/** The trimmed criterion, or `undefined` — a blank field is one left alone, not an empty name. */
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
 * @throws {EmptySearchQuery} if no criterion was given — picking the wrong row out of the whole
 *   archive is the one mistake this feature must not make.
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

  // One more than the screen shows: the extra row is never displayed, it only decides `truncated`.
  const found = await deps.customers.searchArchived(query, MAX_ARCHIVE_SEARCH_RESULTS + 1);
  return {
    matches: found.slice(0, MAX_ARCHIVE_SEARCH_RESULTS).map(toMatch),
    truncated: found.length > MAX_ARCHIVE_SEARCH_RESULTS,
  };
}
