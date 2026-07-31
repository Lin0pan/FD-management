/**
 * The waiting-list screen (tasks/prd-us-12-waiting-list.md §US-12.4).
 *
 * Nothing on it is worked out here. `listWaiting` puts the applicants in the order they joined,
 * numbers them and says whose certificate outlived the wait; `proposeRegistration` says whether a
 * customer number is free. This page lays that out and offers the two things staff do with it.
 *
 * The **order is the feature**, so the screen states the rule above the list and gives it nothing to
 * argue with: no column headings that could be clicked, no way to move a row, and no "Jetzt
 * registrieren" on any row but the one at the top (PRD §6). An expired certificate is a badge beside
 * the applicant and never a reason to drop them down the list (FR-5).
 */

import { proposeRegistration } from "@/application/customers/propose-registration";
import { listWaiting, type WaitingListPlace } from "@/application/waiting-list/list-waiting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { AddApplicantForm } from "./add-applicant-form";
import { waitingListDeps } from "./deps";
import { FreeSlotBanner } from "./free-slot-banner";
import { RemoveApplicantControls } from "./remove-applicant-controls";

/**
 * Both halves of this screen change without anything being written: a wait grows a day at midnight,
 * and a certificate lapses the same way. A cached render would be a screen that quietly stopped
 * being true.
 */
export const dynamic = "force-dynamic";

/** The page frame, the same one every converted screen uses, so they line up under the bar. */
const SHELL = "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 md:p-8";

/**
 * One label and its value, in one `<p>` — the shape the conversion guide's second trap asks for.
 * Split into two stacked nodes they are announced as two unrelated facts, joined only by the layout.
 */
function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function Row({
  place,
  headOfList,
}: {
  place: WaitingListPlace;
  headOfList: boolean;
}): React.ReactElement {
  const applicant = `${place.entry.firstName} ${place.entry.lastName}`;

  return (
    <li
      data-testid="waiting-list-row"
      data-position={place.position}
      // Three lines, not four bands. The row used to spend a 780px bordered bar — the only boxed
      // thing in it, so the first thing the eye landed on — on the action staff perform least.
      // A quiet tint on the head of the list when a slot is free, and only then: it says "this is
      // the row the banner is about", which nothing did. It is not a state, so it is not a badge,
      // and there is no second "Jetzt registrieren" here — two buttons doing one thing is how they
      // come to disagree.
      className={`flex flex-col gap-2 border-b border-border px-3 py-4 first:rounded-t-lg last:rounded-b-lg last:border-0 ${
        headOfList ? "bg-muted/50" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant="secondary" className="tabular-nums">
          <span data-testid="waiting-list-position">
            {de.waitingList.position} {place.position}
          </span>
        </Badge>
        <h3 data-testid="waiting-list-applicant" className="text-lg font-semibold">
          {applicant}
        </h3>
        {/* A fact stated beside the applicant, never a colour that reads as a verdict: they keep
            the place they waited for, and what is asked for is a renewed notice. Amber, which on
            this screen now means this and nothing else — the removal confirmation used to share it
            and is red. */}
        {place.certificateExpired ? (
          <Badge
            variant="outline"
            title={de.waitingList.certificateExpiredHint}
            className="border-amber-500/40 bg-amber-500/10"
          >
            <span data-testid="waiting-list-expired-badge">
              {de.waitingList.certificateExpired}
            </span>
          </Badge>
        ) : null}
        <div className="ms-auto">
          <RemoveApplicantControls entryId={place.entry.id} applicant={applicant} />
        </div>
      </div>

      {/* `flex flex-wrap` rather than a three-column grid: a short list of facts printed in fixed
          columns is three ragged columns, and these three are read together or not at all. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Detail label={de.waitingList.addedOn} value={germanDate(place.entry.addedOn)} />
        <p>
          <span className="text-muted-foreground">{de.waitingList.waited}: </span>
          <span data-testid="waiting-list-days" className="font-medium tabular-nums">
            {de.waitingList.waitedValue(place.daysWaiting)}
          </span>
        </p>
        <Detail
          label={de.customers.fields.certificateValidUntil}
          value={germanDate(place.entry.certificate.validUntil)}
        />
      </div>

      {place.entry.contactNote === "" ? null : (
        <div className="text-sm">
          <Detail label={de.waitingList.contactNote} value={place.entry.contactNote} />
        </div>
      )}
    </li>
  );
}

export default async function WaitingListPage(): Promise<React.ReactElement> {
  const [places, proposal] = await Promise.all([
    listWaiting(waitingListDeps),
    // A full register is `customerNumber: null`, which is exactly the question the banner asks. The
    // proposal is a read and reserves nothing — the number is allocated again when the promoted
    // applicant is actually registered.
    proposeRegistration(waitingListDeps).catch((error: unknown) => {
      // An unseeded database has no quota, so there is no register to say whether a slot is free.
      // That is a setup failure and not an answer, so the banner is simply absent — the list itself
      // is still readable, and it is the part staff came for.
      if (error instanceof DomainError && error.code === "NoSettingsInForce") {
        return null;
      }
      throw error;
    }),
  ]);

  // Position 1 and nobody else: the head of the list the domain ordered. Reading it off the list is
  // deliberate — asking who is next a second time is how the banner and the list come to disagree.
  const [head] = places;
  const freeNumber = proposal?.customerNumber ?? null;

  const slotIsFree = head !== undefined && freeNumber !== null;

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.waitingList.heading}</h1>
      </div>
      <p className="max-w-prose text-muted-foreground">{de.waitingList.intro}</p>
      <p data-testid="waiting-list-order-rule" className="max-w-prose text-muted-foreground">
        {de.waitingList.orderRule}
      </p>

      {slotIsFree ? <FreeSlotBanner head={head} customerNumber={freeNumber} /> : null}

      {/* One card with divided rows rather than a card per applicant: fifteen nested rounded boxes
          read as a pile of panels, and this is a list. */}
      <Card>
        <CardContent>
          {places.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="waiting-list-empty">
                {de.waitingList.empty}
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col">
              {places.map((place) => (
                <Row
                  key={place.entry.id}
                  place={place}
                  headOfList={slotIsFree && place.position === 1}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddApplicantForm />
    </main>
  );
}
