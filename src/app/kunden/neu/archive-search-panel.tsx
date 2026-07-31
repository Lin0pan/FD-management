"use client";

/**
 * The "Im Archiv suchen" panel on the registration screen
 * (tasks/prd-us-11-reuse-archived-record.md §US-11.4).
 *
 * A client component for two reasons: `useActionState` reports the matches and a refusal back into
 * the panel, and picking a result has to reach *into the form beside it* rather than navigate — the
 * draft is handed upwards through `onSelect`, and the screen decides what to do with it.
 *
 * It is a sibling of the registration form, never nested inside it: HTML forms do not nest, and the
 * search criteria are not part of the registration. Nothing here is a rule — which records are
 * searchable and how many are shown are `searchArchivedCustomers`' business, and what a draft may
 * carry is `draftFromArchived`'s.
 */

import { useActionState, useState } from "react";
import type { ArchivedCustomerMatch } from "@/application/customers/search-archived-customers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { loadArchivedDraft, searchArchive } from "./archive-search-actions";
import { initialArchiveSearchState, type PrefillDraft } from "./archive-search-state";

/** One archived household, and the draft read from its record — what a selection consists of. */
export interface ArchiveSelection {
  readonly match: ArchivedCustomerMatch;
  readonly draft: PrefillDraft;
}

function Criterion({
  name,
  label,
  value,
  type = "text",
}: {
  name: string;
  label: string;
  /** What was last submitted, so React's post-action reset restores it instead of clearing it. */
  value: string;
  type?: "text" | "date";
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <Input type={type} name={name} id={name} defaultValue={value} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p>
      <span className="text-sm text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

function MatchRow({
  match,
  pending,
  applied,
  onSelect,
}: {
  match: ArchivedCustomerMatch;
  pending: boolean;
  /** Whether the form below is currently filled from *this* row. */
  applied: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const words = de.customers.archiveSearch.result;

  return (
    // A shortlist entry, not a dossier. The question at this moment is "is this the household in
    // front of me, yes or no", and that is answered by the name, the birthdate and the address. The
    // other five facts each have a reason to be here — the archive reason and the former-number
    // disclaimer both carry arguments of their own — but they are what you read *after* you think
    // you have found them, so they go behind a `<details>` inside the row. Not a `Dialog`: it would
    // portal them out of the `<li>`, where `row.getByTestId(…)` could no longer reach them.
    <li
      data-testid="archive-match"
      data-customer-id={match.customerId}
      className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p data-testid="archive-match-name" className="font-semibold">
          {match.firstName} {match.lastName}
        </p>
        <p className="text-sm text-muted-foreground">{germanDate(match.birthDate)}</p>
        <p className="text-sm text-muted-foreground">
          {`${match.address.street} ${match.address.houseNumber}, ${match.address.zip} ${match.address.city}`}
        </p>
        {/* The row that was clicked says so. Applying a household fills a form below the fold and
            moves nothing; with twenty rows on screen and every one of them still offering "Daten
            übernehmen", a staff member's only evidence that anything happened was a paragraph that
            had scrolled halfway into view. */}
        {applied ? (
          <Badge variant="secondary" className="ms-auto" data-testid="archive-match-applied">
            {words.applied}
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`archive-select-${match.customerId}`}
            disabled={pending}
            onClick={onSelect}
            className="ms-auto"
          >
            {pending ? words.selecting : words.select}
          </Button>
        )}
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground underline-offset-4 hover:underline">
          {words.moreDetail}
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <Detail label={words.archivedOn} value={germanDate(match.archivedAt)} />
          <p data-testid="archive-match-household-size" className="text-muted-foreground">
            {words.householdSize(match.householdSize)}
          </p>
          <p>
            <span className="text-muted-foreground">{words.archiveReason}: </span>
            {/* Verbatim, and `whitespace-pre-line` with it: the reason was typed by hand into a
                multi-line field (US-10) and may be exactly what staff need to read before they
                re-register someone (PRD §6). */}
            <span data-testid="archive-match-reason" className="whitespace-pre-line">
              {match.archiveReason}
            </span>
          </p>
          {/* The former number, and immediately under it the sentence that stops it being read as an
              offer. It is here for recognition only — the number was freed the day this household
              was archived, and the registration allocates a fresh one (FR-3). */}
          <p>
            <span className="text-muted-foreground">{words.formerNumber}: </span>
            <span data-testid="archive-match-former-number" className="tabular-nums">
              {match.formerCustomerNumber}
            </span>
          </p>
          <p className="max-w-prose text-xs text-muted-foreground">{words.formerNumberHint}</p>
        </div>
      </details>
    </li>
  );
}

export function ArchiveSearchPanel({
  onSelect,
  appliedCustomerId,
}: {
  onSelect: (selection: ArchiveSelection) => void;
  /** The archived household the form is filled from, or `null` — owned by the screen, not here. */
  appliedCustomerId: number | null;
}): React.ReactElement {
  const [state, formAction, searching] = useActionState(searchArchive, initialArchiveSearchState);
  // Which row is being read, so only that row's button says "Wird übernommen …" — with twenty rows
  // on screen, disabling all of them would hide which one was clicked.
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  async function select(match: ArchivedCustomerMatch): Promise<void> {
    setLoadingId(match.customerId);
    setSelectError(null);
    const result = await loadArchivedDraft(match.customerId);
    setLoadingId(null);
    if (result.status === "error") {
      setSelectError(result.message);
      return;
    }
    onSelect({ match, draft: result.draft });
  }

  const words = de.customers.archiveSearch;

  return (
    <Card>
      {/*
       * A disclosure, and open by default.
       *
       * FD asked for this panel to fold away — it is 150px spent on a job done a few times a year,
       * standing above the one the screen is actually for. What it must not become is *closed* by
       * default: the cost of missing this search is a second record for a household FD already has,
       * which is the whole of US-11, and three specs reach `#archiveLastName` and `#group-RED` by id
       * — a control inside a closed `<details>` is invisible, and `fill()` and `check()` time out
       * against it. So the fold exists and staff may use it; the default state is the one the
       * contract requires.
       */}
      <details open>
        {/* No `w-fit` here, unlike the danger-zone summaries: this one wraps a `CardHeader`, and
            shrinking a header to its minimum content width wraps the description into a column —
            measured at 348px tall for two lines of text. A summary that *is* the card's header
            spans the card. */}
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <CardHeader>
            <CardTitle>
              <h2>{words.heading}</h2>
            </CardTitle>
            <CardDescription>{words.intro}</CardDescription>
          </CardHeader>
        </summary>

        <CardContent className="mt-6 flex flex-col gap-4">
          {/* The three criteria and the button on one row: the button used to sit on a line of its
              own, which is most of what made this panel 270px tall to be a three-field search. */}
          <form action={formAction} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Criterion
              name="archiveLastName"
              label={de.customers.fields.lastName}
              value={state.criteria.lastName}
            />
            <Criterion
              name="archiveFirstName"
              label={de.customers.fields.firstName}
              value={state.criteria.firstName}
            />
            <Criterion
              name="archiveBirthDate"
              label={de.customers.fields.birthDate}
              type="date"
              value={state.criteria.birthDate}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={searching}
              data-testid="archive-search-submit"
            >
              {searching ? words.submitting : words.submit}
            </Button>
          </form>

          {state.status === "error" ? (
            <Alert variant="destructive" role="status">
              <AlertDescription data-testid="archive-search-error" className="max-w-prose">
                {state.message}
              </AlertDescription>
            </Alert>
          ) : null}

          {state.status === "results" && state.matches.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="archive-search-empty" className="max-w-prose">
                {words.noMatches}
              </AlertDescription>
            </Alert>
          ) : null}

          {state.matches.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p data-testid="archive-search-count" className="text-sm text-muted-foreground">
                {words.resultsHeading(state.matches.length)}
              </p>
              {/* Not a count of what was left out and not a "next page": the answer to a list this
                  long is a narrower search, and a number would only invite paging towards it.
                  Neutral rather than amber — amber is the lapsed certificate, and this is a remark
                  about the search rather than about any household. */}
              {state.truncated ? (
                <Alert role="status">
                  <AlertDescription data-testid="archive-search-truncated" className="max-w-prose">
                    {words.tooMany(state.matches.length)}
                  </AlertDescription>
                </Alert>
              ) : null}
              <ul className="flex flex-col">
                {state.matches.map((match) => (
                  <MatchRow
                    key={match.customerId}
                    match={match}
                    pending={loadingId === match.customerId}
                    applied={appliedCustomerId === match.customerId}
                    onSelect={() => void select(match)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {selectError === null ? null : (
            <Alert variant="destructive" role="status">
              <AlertDescription data-testid="archive-prefill-error" className="max-w-prose">
                {selectError}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </details>
    </Card>
  );
}
