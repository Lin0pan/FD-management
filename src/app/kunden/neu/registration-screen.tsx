"use client";

/**
 * The registration screen's client half: the archive search, the form, and the one piece of state
 * they share — which archived household, if any, the form was filled from
 * (tasks/prd-us-11-reuse-archived-record.md §US-11.4).
 *
 * The pre-fill is applied by **remounting the form** rather than by writing into its fields: the
 * form holds some values in React state and others as plain `defaultValue`s, and a `key` change
 * resets both in one move. That is also what "leer beginnen" means here — clearing the selection
 * mounts a blank form, with no half-filled field left behind from the household that was dropped.
 *
 * The panel is a sibling of the form, never nested in it: HTML forms do not nest, and the search
 * criteria are not part of the registration that gets saved.
 */

import { useState } from "react";
import type { RegistrationProposal } from "@/application/customers/propose-registration";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { ArchiveSearchPanel, type ArchiveSelection } from "./archive-search-panel";
import { RegistrationForm } from "./registration-form";

export function RegistrationScreen({
  proposal,
}: {
  proposal: RegistrationProposal;
}): React.ReactElement {
  const [selection, setSelection] = useState<ArchiveSelection | null>(null);
  // Bumped on every apply and every clear, so picking a second household after a first replaces the
  // form rather than merging into it.
  const [formGeneration, setFormGeneration] = useState(0);

  function apply(next: ArchiveSelection | null): void {
    setSelection(next);
    setFormGeneration((generation) => generation + 1);
  }

  const words = de.customers.archiveSearch.prefilled;

  return (
    <div className="flex flex-col gap-6">
      <ArchiveSearchPanel onSelect={apply} />

      {selection === null ? null : (
        // Stated before the form and not inside it, because it is not about any one field: the
        // riskiest mistake this feature can produce is a staff member believing the archived record
        // was reactivated (PRD §6), and the correction has to be read before the form is.
        //
        // Neutral, not amber. Amber means one thing across the application — a certificate has
        // lapsed — and this is not a warning at all: it is a statement of provenance with an undo
        // attached. The `<h2>` stays, because `Alert` supplies no heading of its own.
        <Alert role="status" data-testid="archive-prefill-notice">
          <AlertDescription className="flex max-w-prose flex-col items-start gap-3">
            <h2 className="font-semibold text-foreground">{words.heading}</h2>
            <p data-testid="archive-prefill-detail">
              {words.detail(
                `${selection.match.firstName} ${selection.match.lastName}`,
                selection.match.formerCustomerNumber,
                germanDate(selection.match.archivedAt),
              )}
            </p>
            <p className="text-sm">{words.editableHint}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="archive-prefill-clear"
              onClick={() => apply(null)}
            >
              {words.clear}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <RegistrationForm
        key={formGeneration}
        proposal={proposal}
        draft={selection?.draft ?? null}
        previousCustomerId={selection?.match.customerId ?? null}
      />
    </div>
  );
}
