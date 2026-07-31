/**
 * The "a slot is free" banner (US-12.4, FR-4) — the feature's whole value.
 *
 * Without it, a freed customer number is only noticed by someone who thinks to open the waiting list,
 * and the applicant who has waited longest waits on (PRD §6). So it names one applicant and one
 * number, and it stands both on the list itself and on `/kunden/neu`, where the number is about to
 * be handed out — a walk-in should not jump the queue silently (US-18.3).
 *
 * It never picks anybody. Whoever is at the head of the list is `inArrivalOrder`'s answer, read off
 * the list the page already has — asking a second time is how two screens come to name two different
 * applicants.
 */

import Link from "next/link";
import type { WaitingListPlace } from "@/application/waiting-list/list-waiting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { FREE_SLOT_ACCENT } from "../accents";

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
    // Emerald, because the hub badge already says "a slot is free" in emerald (US-18.2) and the same
    // fact painted two ways on two screens is how one of them comes to be believed over the other.
    // It was the palest thing on a screen where the act is actually performed; it is now the
    // loudest, which is what PRD §6 says it is worth.
    <Card data-testid="waiting-list-free-slot" className={`ring-0 ${FREE_SLOT_ACCENT} border`}>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{de.waitingList.banner.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p data-testid="waiting-list-free-slot-detail" className="max-w-prose">
          {de.waitingList.banner.names(applicant, customerNumber)}
        </p>
        {/* Stated on the banner as well as on the row: whoever acts on the banner has to know a
            renewed notice will be needed before they walk over to the applicant, not after. */}
        {head.certificateExpired ? (
          <Alert role="status" className="border-amber-500/40 bg-amber-500/10">
            <AlertDescription data-testid="waiting-list-free-slot-expired" className="max-w-prose">
              {de.waitingList.certificateExpired} — {de.waitingList.certificateExpiredHint}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" asChild>
            <Link
              href={`/warteliste/${head.entry.id}/registrieren`}
              data-testid="waiting-list-promote"
            >
              {de.waitingList.banner.action}
            </Link>
          </Button>
          {showListLink ? (
            <Button variant="ghost" size="lg" asChild>
              <Link href="/warteliste" data-testid="waiting-list-banner-link">
                {de.waitingList.banner.listLink}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
