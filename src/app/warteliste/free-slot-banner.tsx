/**
 * The "a slot is free" banner (US-12.4, FR-4) — the feature's whole value.
 *
 * Without it, a freed customer number is only noticed by someone who thinks to open the waiting list,
 * and the applicant who has waited longest waits on (PRD §6). So it names one applicant and one
 * number, and it appears on the home screen as well as on the list itself.
 *
 * It never picks anybody. Whoever is at the head of the list is `inArrivalOrder`'s answer, read off
 * the list the page already has — asking a second time is how two screens come to name two different
 * applicants.
 */

import Link from "next/link";
import type { WaitingListPlace } from "@/application/waiting-list/list-waiting";
import { de } from "@/i18n/de";

export function FreeSlotBanner({
  head,
  customerNumber,
  showListLink = false,
}: {
  /** The applicant at the top of the list — position 1, and nobody else. */
  head: WaitingListPlace;
  /** The lowest free number, which is the one they would be given. */
  customerNumber: number;
  /** On the home screen the list is not on view, so the banner offers the way to it as well. */
  showListLink?: boolean;
}): React.ReactElement {
  const applicant = `${head.entry.firstName} ${head.entry.lastName}`;

  return (
    <section
      data-testid="waiting-list-free-slot"
      className="flex flex-col gap-3 rounded-xl border border-foreground/30 bg-foreground/5 p-6"
    >
      <h2 className="text-xl font-semibold">{de.waitingList.banner.heading}</h2>
      <p data-testid="waiting-list-free-slot-detail" className="max-w-prose">
        {de.waitingList.banner.names(applicant, customerNumber)}
      </p>
      {/* Stated on the banner as well as on the row: whoever acts on the banner has to know a
          renewed notice will be needed before they walk over to the applicant, not after. */}
      {head.certificateExpired ? (
        <p
          data-testid="waiting-list-free-slot-expired"
          className="max-w-prose rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {de.waitingList.certificateExpired} — {de.waitingList.certificateExpiredHint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <Link
          href={`/warteliste/${head.entry.id}/registrieren`}
          data-testid="waiting-list-promote"
          className="rounded bg-foreground px-4 py-2 font-semibold text-background"
        >
          {de.waitingList.banner.action}
        </Link>
        {showListLink ? (
          <Link
            href="/warteliste"
            data-testid="waiting-list-banner-link"
            className="self-center underline underline-offset-4"
          >
            {de.waitingList.banner.listLink}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
