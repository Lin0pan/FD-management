"use client";

/**
 * The promotion screen's client half (US-12.4).
 *
 * Its one job is the warning: when the certificate the applicant joined with has lapsed while they
 * waited, staff read *before* the form opens that a current notice is needed (FR-5). It is a step and
 * not a dialog — nothing is dismissed, the page's own way back to the list stays below it, and the
 * applicant is never refused. FD has not decided how such a case is settled (PRD §9), so the screen
 * states the fact and leaves the judgement where it belongs.
 *
 * With a valid certificate there is nothing to warn about and the form is simply there.
 */

import { useState } from "react";
import type { RegistrationProposal } from "@/application/customers/propose-registration";
import type { PrefillDraft } from "@/app/kunden/neu/archive-search-state";
import { RegistrationForm } from "@/app/kunden/neu/registration-form";
import { de } from "@/i18n/de";
import { submitPromotedRegistration } from "./actions";

export function PromotionScreen({
  proposal,
  draft,
  entryId,
  certificateExpired,
  certificateValidUntil,
}: {
  proposal: RegistrationProposal;
  draft: PrefillDraft;
  entryId: number;
  certificateExpired: boolean;
  /** The day the certificate ran to, already written as `TT.MM.JJJJ` — named in the warning. */
  certificateValidUntil: string;
}): React.ReactElement {
  const [acknowledged, setAcknowledged] = useState(!certificateExpired);

  if (!acknowledged) {
    return (
      <section
        data-testid="promotion-expired-warning"
        className="flex max-w-prose flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-6"
      >
        <h2 className="text-xl font-semibold">{de.waitingList.promote.expiredHeading}</h2>
        <p data-testid="promotion-expired-detail">
          {de.waitingList.promote.expiredDetail(certificateValidUntil)}
        </p>
        <div>
          <button
            type="button"
            data-testid="promotion-expired-continue"
            onClick={() => setAcknowledged(true)}
            className="rounded bg-foreground px-4 py-2 font-semibold text-background"
          >
            {de.waitingList.promote.expiredContinue}
          </button>
        </div>
      </section>
    );
  }

  return (
    <RegistrationForm
      proposal={proposal}
      draft={draft}
      entryId={entryId}
      submit={submitPromotedRegistration}
    />
  );
}
