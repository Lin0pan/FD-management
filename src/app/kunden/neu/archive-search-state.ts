/**
 * The state the archive-search panel and its server action pass between them (US-11.4).
 *
 * It lives outside `archive-search-actions.ts` because a `"use server"` module may export nothing
 * but async functions — everything it exports becomes a callable server endpoint, so a plain object
 * or an interface alias there is a build-time error rather than a style question.
 */

import type { ArchivedCustomerMatch } from "@/application/customers/search-archived-customers";

/**
 * What the panel shows after a search.
 *
 * `idle` is the state before anything was searched, and it is deliberately distinct from a search
 * that found nothing: "kein Treffer" is an answer, and showing it before anybody has typed would
 * tell staff the household is unknown when nobody has looked yet.
 */
export interface ArchiveSearchState {
  readonly status: "idle" | "results" | "error";
  readonly matches: ReadonlyArray<ArchivedCustomerMatch>;
  /** Whether the register held more matches than the list shows — see `MAX_ARCHIVE_SEARCH_RESULTS`. */
  readonly truncated: boolean;
  readonly message?: string;
}

export const initialArchiveSearchState: ArchiveSearchState = {
  status: "idle",
  matches: [],
  truncated: false,
};

/**
 * What comes back when staff pick a result: the draft to fill the form with, or the German sentence
 * explaining why it could not be read.
 *
 * A discriminated union rather than a nullable draft, because the panel has to say *something* when
 * the archived record has moved on since the search — a silently unfilled form would read as a
 * click that did not register.
 */
export type ArchiveDraftResult =
  | {
      readonly status: "ok";
      readonly draft: PrefillDraft;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

/**
 * A registration draft as it crosses to the browser: the same values `draftFromArchived` returns,
 * with the calendar days already written the way `<input type="date">` reads them.
 *
 * The conversion happens on the server so that a `Date` never has to survive the round trip and be
 * re-read in the browser's own zone, which is how a birthdate lands on the day before.
 */
export interface PrefillDraft {
  readonly firstName: string;
  readonly lastName: string;
  /** `YYYY-MM-DD`, the UTC day the record names. */
  readonly birthDate: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
  readonly householdMembers: ReadonlyArray<PrefillMember>;
}

export interface PrefillMember {
  readonly firstName: string;
  readonly lastName: string;
  /** `YYYY-MM-DD`, the UTC day the record names. */
  readonly birthDate: string;
}
