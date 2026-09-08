"use client";

/**
 * The registration screen's client half: the archive search, the form, and the one piece of state they
 * share (`tasks/prd-us-11-reuse-archived-record.md` §US-11.4).
 *
 * The pre-fill is applied by **remounting the form** rather than writing into its fields — a `key`
 * change resets both the React state and the `defaultValue`s in one move, which is also what "leer
 * beginnen" means here.
 *
 * The panel is a **sibling** of the form, never nested: HTML forms do not nest.
 */

import { useEffect, useState } from "react";
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

  /**
   * Put the cursor in the first field after a household has been applied — the pre-fill lands ~700px
   * below the fold and moves the page not at all, so focusing scrolls the form into view and says
   * "you can start typing" in one gesture.
   *
   * `formGeneration` is what makes it fire at the right moment: the form is remounted on every apply,
   * so the new `#firstName` does not exist until that render. The guard stops the first paint and
   * "leer beginnen" stealing the focus.
   */
  useEffect(() => {
    if (selection === null) {
      return;
    }
    document.getElementById("firstName")?.focus();
  }, [formGeneration, selection]);

  const words = de.customers.archiveSearch.prefilled;

  return (
    <div className="flex flex-col gap-6">
      <ArchiveSearchPanel
        onSelect={apply}
        appliedCustomerId={selection?.match.customerId ?? null}
      />

      {selection === null ? null : (
        // Before the form and not inside it: the riskiest mistake here is believing the archived
        // record was reactivated (PRD §6), and the correction has to be read before the form is.
        //
        // Neutral, not amber: this is a statement of provenance with an undo attached, not a warning.
        // The `<h2>` stays, because `Alert` supplies no heading of its own.
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
