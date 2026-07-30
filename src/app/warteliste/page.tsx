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

function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p>
      <span className="text-sm text-foreground/70">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function Row({ place }: { place: WaitingListPlace }): React.ReactElement {
  const applicant = `${place.entry.firstName} ${place.entry.lastName}`;

  return (
    <li
      data-testid="waiting-list-row"
      data-position={place.position}
      className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span
          data-testid="waiting-list-position"
          className="rounded-full bg-foreground/10 px-3 py-1 text-sm tabular-nums"
        >
          {de.waitingList.position} {place.position}
        </span>
        <h3 data-testid="waiting-list-applicant" className="text-xl font-semibold">
          {applicant}
        </h3>
        {/* A fact stated beside the applicant, never a colour that reads as a verdict: they keep
            the place they waited for, and what is asked for is a renewed notice. */}
        {place.certificateExpired ? (
          <span
            data-testid="waiting-list-expired-badge"
            title={de.waitingList.certificateExpiredHint}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-sm"
          >
            {de.waitingList.certificateExpired}
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Detail label={de.waitingList.addedOn} value={germanDate(place.entry.addedOn)} />
        <p>
          <span className="text-sm text-foreground/70">{de.waitingList.waited}: </span>
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
        <Detail label={de.waitingList.contactNote} value={place.entry.contactNote} />
      )}

      <RemoveApplicantControls entryId={place.entry.id} applicant={applicant} />
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.waitingList.heading}</h1>
      <p className="max-w-prose text-foreground/80">{de.waitingList.intro}</p>
      <p data-testid="waiting-list-order-rule" className="max-w-prose text-foreground/80">
        {de.waitingList.orderRule}
      </p>

      {head !== undefined && freeNumber !== null ? (
        <FreeSlotBanner head={head} customerNumber={freeNumber} />
      ) : null}

      {places.length === 0 ? (
        <p data-testid="waiting-list-empty" className="max-w-prose">
          {de.waitingList.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {places.map((place) => (
            <Row key={place.entry.id} place={place} />
          ))}
        </ul>
      )}

      <AddApplicantForm />
    </main>
  );
}
