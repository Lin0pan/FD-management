"use server";

/**
 * The archive-search panel's server actions (US-11.4). Both are **reads**: nothing writes, nothing is
 * reserved and no audit entry is due — the decision is taken by `submitRegistration` once staff press
 * Aufnehmen. The rules live behind the two use cases.
 */

import { draftFromArchived } from "@/application/customers/draft-from-archived";
import { searchArchivedCustomers } from "@/application/customers/search-archived-customers";
import { CustomerNotArchived, CustomerNotFound, EmptySearchQuery } from "@/domain/errors";
import { de } from "@/i18n/de";
import { isBlankDay, parseCalendarDay } from "@/domain/calendarDay";
import { tierOf } from "../../notice-tier";
import { customerDeps } from "../deps";
import type { ArchiveDraftResult, ArchiveSearchState } from "./archive-search-state";
import { toPrefillDraft } from "./registration-input";

/**
 * A calendar day as DF type it, or `undefined` for a blank field — which is not a criterion at all.
 *
 * A malformed value is treated the same way, and **this is the one place that is right**: the date is
 * one of three *optional* criteria, so there is nothing to reject. Where a day is required it is
 * refused out loud instead (`calendarDay` in `registration-input.ts`).
 */
function optionalCalendarDay(value: string): Date | undefined {
  if (isBlankDay(value)) return undefined;
  try {
    return parseCalendarDay(value);
  } catch {
    return undefined;
  }
}

/**
 * Search the archive and hand the matches back to the panel. An all-blank query comes back as a
 * sentence rather than the whole archive — which fields would narrow it is the useful half of that
 * refusal, and `EmptySearchQuery` carries them so this screen never has to guess.
 */
export async function searchArchive(
  _previous: ArchiveSearchState,
  formData: FormData,
): Promise<ArchiveSearchState> {
  const text = (name: string): string => String(formData.get(name) ?? "");
  // Carried back on both paths so the panel can refill the fields: an answer whose question has been
  // deleted cannot be narrowed.
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
 * Read one archived record and hand back the values the registration form is filled with. Called on a
 * pick rather than on a search, the draft being the whole household where the result list is only
 * what tells two apart. It creates nothing.
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
