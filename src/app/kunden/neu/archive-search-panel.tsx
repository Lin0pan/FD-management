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
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { loadArchivedDraft, searchArchive } from "./archive-search-actions";
import { initialArchiveSearchState, type PrefillDraft } from "./archive-search-state";

const fieldClass = "w-full rounded border border-foreground/20 bg-transparent px-2 py-1";

/** One archived household, and the draft read from its record — what a selection consists of. */
export interface ArchiveSelection {
  readonly match: ArchivedCustomerMatch;
  readonly draft: PrefillDraft;
}

function Criterion({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: "text" | "date";
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input className={fieldClass} type={type} name={name} id={name} defaultValue="" />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p>
      <span className="text-sm text-foreground/70">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

function MatchRow({
  match,
  pending,
  onSelect,
}: {
  match: ArchivedCustomerMatch;
  pending: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const words = de.customers.archiveSearch.result;

  return (
    <li
      data-testid="archive-match"
      data-customer-id={match.customerId}
      className="flex flex-col gap-2 rounded border border-foreground/15 px-3 py-3"
    >
      <p data-testid="archive-match-name" className="font-semibold">
        {match.firstName} {match.lastName}
      </p>
      <div className="grid gap-1 sm:grid-cols-2">
        <Detail label={de.customers.fields.birthDate} value={germanDate(match.birthDate)} />
        <Detail
          label={de.customers.new.addressHeading}
          value={`${match.address.street} ${match.address.houseNumber}, ${match.address.zip} ${match.address.city}`}
        />
        <Detail label={words.archivedOn} value={germanDate(match.archivedAt)} />
      </div>
      <p data-testid="archive-match-household-size" className="text-sm text-foreground/70">
        {words.householdSize(match.householdSize)}
      </p>
      <p>
        <span className="text-sm text-foreground/70">{words.archiveReason}: </span>
        {/* Verbatim, and `whitespace-pre-line` with it: the reason was typed by hand into a
            multi-line field (US-10) and may be exactly what staff need to read before they
            re-register someone (PRD §6). */}
        <span data-testid="archive-match-reason" className="whitespace-pre-line">
          {match.archiveReason}
        </span>
      </p>
      {/* The former number, and immediately under it the sentence that stops it being read as an
          offer. It is here for recognition only — the number was freed the day this household was
          archived, and the registration allocates a fresh one (FR-3). */}
      <p>
        <span className="text-sm text-foreground/70">{words.formerNumber}: </span>
        <span data-testid="archive-match-former-number" className="tabular-nums">
          {match.formerCustomerNumber}
        </span>
      </p>
      <p className="max-w-prose text-xs text-foreground/60">{words.formerNumberHint}</p>
      <div>
        <button
          type="button"
          data-testid={`archive-select-${match.customerId}`}
          disabled={pending}
          onClick={onSelect}
          className="rounded border border-foreground/20 px-3 py-1 text-sm disabled:opacity-60"
        >
          {pending ? words.selecting : words.select}
        </button>
      </div>
    </li>
  );
}

export function ArchiveSearchPanel({
  onSelect,
}: {
  onSelect: (selection: ArchiveSelection) => void;
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
    <section className="flex flex-col gap-4 rounded border border-foreground/20 p-4">
      <h2 className="text-xl font-semibold">{words.heading}</h2>
      <p className="max-w-prose text-sm text-foreground/70">{words.intro}</p>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Criterion name="archiveLastName" label={de.customers.fields.lastName} />
          <Criterion name="archiveFirstName" label={de.customers.fields.firstName} />
          <Criterion name="archiveBirthDate" label={de.customers.fields.birthDate} type="date" />
        </div>
        <div>
          <button
            type="submit"
            disabled={searching}
            data-testid="archive-search-submit"
            className="rounded border border-foreground/20 px-4 py-2 disabled:opacity-60"
          >
            {searching ? words.submitting : words.submit}
          </button>
        </div>
      </form>

      {state.status === "error" ? (
        <p
          role="status"
          data-testid="archive-search-error"
          className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "results" && state.matches.length === 0 ? (
        <p role="status" data-testid="archive-search-empty" className="max-w-prose">
          {words.noMatches}
        </p>
      ) : null}

      {state.matches.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p data-testid="archive-search-count" className="text-sm text-foreground/70">
            {words.resultsHeading(state.matches.length)}
          </p>
          {/* Not a count of what was left out and not a "next page": the answer to a list this long
              is a narrower search, and a number would only invite paging towards it. */}
          {state.truncated ? (
            <p
              data-testid="archive-search-truncated"
              className="max-w-prose rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2"
            >
              {words.tooMany(state.matches.length)}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {state.matches.map((match) => (
              <MatchRow
                key={match.customerId}
                match={match}
                pending={loadingId === match.customerId}
                onSelect={() => void select(match)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {selectError === null ? null : (
        <p
          role="status"
          data-testid="archive-prefill-error"
          className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          {selectError}
        </p>
      )}
    </section>
  );
}
