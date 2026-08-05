"use server";

/**
 * The archive-search panel's server actions — the thin adapter between the panel on the registration
 * screen and the two use cases behind it (US-11.4).
 *
 * Both actions are **reads**. Nothing here writes, nothing is reserved and no audit entry is due:
 * finding a household FD used to know is not a decision, and the decision — registering them again —
 * is taken by the ordinary `submitRegistration` action once staff press Aufnehmen.
 *
 * As everywhere in `app/`, the rules live behind the use cases: which records may be searched, how
 * many are shown, and what a draft may carry are `searchArchivedCustomers` and `draftFromArchived`'s
 * business. This file gives the typed inputs a shape and turns a typed domain error into German.
 */

import { draftFromArchived } from "@/application/customers/draft-from-archived";
import { searchArchivedCustomers } from "@/application/customers/search-archived-customers";
import { CustomerNotArchived, CustomerNotFound, EmptySearchQuery } from "@/domain/errors";
import { de } from "@/i18n/de";
import { tierOf } from "../../notice-tier";
import { customerDeps } from "../deps";
import type { ArchiveDraftResult, ArchiveSearchState } from "./archive-search-state";
import { toPrefillDraft } from "./registration-input";

/**
 * A calendar day as `<input type="date">` submits it, read as the UTC day it names — or `undefined`
 * for a field left blank, which is not a criterion at all.
 *
 * A malformed value is treated the same way. The date field is one of three optional criteria, so
 * there is nothing to reject: what the search sees is a search that was not narrowed by a birthdate.
 */
function optionalCalendarDay(value: string): Date | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

/**
 * Search the archive for the household staff described, and hand the matches back to the panel.
 *
 * An all-blank query comes back as a German sentence rather than the whole archive: which fields
 * would narrow it is the useful half of that refusal, and `EmptySearchQuery` is thrown precisely so
 * this screen never has to guess.
 */
export async function searchArchive(
  _previous: ArchiveSearchState,
  formData: FormData,
): Promise<ArchiveSearchState> {
  const text = (name: string): string => String(formData.get(name) ?? "");
  // Carried back on both paths so the panel can refill the fields: an answer whose question has
  // been deleted cannot be narrowed, and a refusal that clears what it is refusing is worse still.
  const criteria = {
    lastName: text("archiveLastName"),
    firstName: text("archiveFirstName"),
    birthDate: text("archiveBirthDate"),
  };

  try {
    const found = await searchArchivedCustomers(customerDeps, {
      lastName: criteria.lastName,
      firstName: criteria.firstName,
      birthDate: optionalCalendarDay(criteria.birthDate),
    });
    return { status: "results", matches: found.matches, truncated: found.truncated, criteria };
  } catch (error: unknown) {
    const message =
      error instanceof EmptySearchQuery
        ? de.customers.archiveSearch.noCriteria
        : de.customers.archiveSearch.errors.unknown;
    return {
      status: "error",
      matches: [],
      truncated: false,
      message,
      criteria,
      tier: tierOf(error),
    };
  }
}

/**
 * Read one archived record and hand back the values the registration form is filled with.
 *
 * Called when staff pick a result rather than when they search, because the draft is the whole
 * household and the result list is only what distinguishes one household from another. It creates
 * nothing: `draftFromArchived` is a read, and the archived record is left exactly as it was found.
 */
export async function loadArchivedDraft(archivedCustomerId: number): Promise<ArchiveDraftResult> {
  const words = de.customers.archiveSearch.errors;
  try {
    const draft = await draftFromArchived(customerDeps, { archivedCustomerId });
    return { status: "ok", draft: toPrefillDraft(draft) };
  } catch (error: unknown) {
    if (error instanceof CustomerNotFound) {
      return { status: "error", message: words.notFound, tier: tierOf(error) };
    }
    if (error instanceof CustomerNotArchived) {
      return { status: "error", message: words.notArchived, tier: tierOf(error) };
    }
    return { status: "error", message: words.prefillFailed, tier: tierOf(error) };
  }
}
