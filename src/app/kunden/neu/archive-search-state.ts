/**
 * The state the archive-search panel and its server action pass between them (US-11.4).
 *
 * It lives outside `archive-search-actions.ts` because a `"use server"` module may export nothing
 * but async functions — everything it exports becomes a callable server endpoint, so a plain object
 * or an interface alias there is a build-time error rather than a style question.
 */

import type { ArchivedCustomerMatch } from "@/application/customers/search-archived-customers";
import type { NoticeTier } from "../../notice-tier";

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
  /**
   * Which of the two refusals this is, decided from the typed error (`notice-tier.ts`).
   *
   * Optional for the same reason `message` is: this is a flat interface rather than a discriminated
   * union, so neither field can be required while `idle` and `results` share the shape.
   */
  readonly tier?: NoticeTier;
  /**
   * What was actually asked, handed straight back so the panel can put it in the fields again.
   *
   * React resets a form once its action resolves, and a reset restores each input from its
   * `defaultValue` *attribute* — so three `defaultValue=""` inputs came back empty and the screen
   * showed an answer with the question deleted. Feeding the submitted criteria back through this
   * makes that same reset restore the question instead, which is the mechanism `group-control.tsx`
   * relies on from the other side.
   */
  readonly criteria: ArchiveSearchCriteria;
}

/** The three criteria exactly as they were typed — raw strings, never parsed here. */
export interface ArchiveSearchCriteria {
  readonly lastName: string;
  readonly firstName: string;
  /** `YYYY-MM-DD`, or `""`. Kept as the field submitted it, malformed values included. */
  readonly birthDate: string;
}

const NO_CRITERIA: ArchiveSearchCriteria = { lastName: "", firstName: "", birthDate: "" };

export const initialArchiveSearchState: ArchiveSearchState = {
  status: "idle",
  matches: [],
  truncated: false,
  criteria: NO_CRITERIA,
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
  | ArchiveDraftRefusal;

/** The refusing half of {@link ArchiveDraftResult}, named because the panel holds one in state. */
export interface ArchiveDraftRefusal {
  readonly status: "error";
  readonly message: string;
  readonly tier: NoticeTier;
}

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
  /**
   * The certificate and the note the draft was written from, or absent when it carries none.
   *
   * Which of the two it is says something about where the draft came from, and the difference is
   * deliberate. An **archived record** carries neither (US-11.2): its certificate is years old and
   * nobody has looked at it since, so asking for a fresh one is the point. A **waiting-list
   * promotion** carries both (US-12.2): the certificate was seen when the applicant joined and has
   * just been re-checked, and the note is the most current thing DF knows about them.
   */
  readonly certificateType?: string;
  /** `YYYY-MM-DD`, the UTC day the certificate runs to. */
  readonly certificateValidUntil?: string;
  readonly notes?: string;
}

export interface PrefillMember {
  readonly firstName: string;
  readonly lastName: string;
  /** `YYYY-MM-DD`, the UTC day the record names. */
  readonly birthDate: string;
}
