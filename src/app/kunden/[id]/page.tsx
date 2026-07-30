/**
 * The customer record — everything known about one household, and everything editable about them
 * (tasks/prd-us-16-maintain-customer-record.md §US-16.5).
 *
 * Everything on screen that could be worked out already has been: `readCustomer` derives the
 * household counts from the birthdates, the card number from the slot and the card index, the
 * hand-out history and the two group sizes. This page lays them out and offers five forms, each
 * saving through one use case of its own.
 *
 * The forms are separate because the edits are separate decisions with separate audit entries
 * (PRD §7). They are laid out in the order a record is read rather than the order it is written:
 * who this is, where they live, who lives with them, what they may collect, and — last, behind a
 * heading that says so — the actions that cannot simply be typed over again.
 *
 * An archived record renders **fully read-only** (FR-8): every form is replaced by the same values
 * as text, so nothing on the screen invites an edit the use cases would refuse anyway.
 */

import Link from "next/link";
import { readCustomer, type CustomerCardView } from "@/application/customers/read-customer";
import { readCurrentSettings } from "@/application/settings/read-current-settings";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { ArchiveControls } from "../archive-controls";
import { BlockControls } from "../block-controls";
import { customerDeps } from "../deps";
import { isoDay } from "../neu/registration-input";
import { DetailsEditor } from "./details-editor";
import { GroupControl } from "./group-control";
import { HouseholdEditor, type AllowanceValues } from "./household-editor";
import { NotesEditor } from "./notes-editor";
import { ReissueControls } from "./reissue-controls";
import { RenewalForm } from "./renewal-form";

/** The record shows data its own forms write, so it must never be served from a cache. */
export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p className="rounded border border-foreground/15 px-3 py-2">
      <span className="text-sm text-foreground/70">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

/** A derived figure, in the same box whether the record is editable or read-only. */
function Derived({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}): React.ReactElement {
  return (
    <p className="rounded border border-foreground/15 px-3 py-2">
      <span className="text-sm text-foreground/70">{label}: </span>
      <span data-testid={testId} className="font-semibold tabular-nums">
        {value}
      </span>
    </p>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

function NotFound(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.customers.card.heading}</h1>
      <p className="max-w-prose">{de.customers.errors.notFound}</p>
      <Link href="/" className="underline underline-offset-4">
        {de.customers.card.backToHome}
      </Link>
    </main>
  );
}

/**
 * What an archived record says about itself: when it happened, why, and that nothing on the screen
 * can be changed any more. It is the first thing on the page rather than a note further down —
 * every action below it is gone, and a reader has to know why before they look for one (US-10.4).
 */
function ArchivedBanner({
  archivedAt,
  reason,
}: {
  archivedAt: Date | null;
  reason: string | null;
}): React.ReactElement {
  return (
    <section
      data-testid="archived-banner"
      className="flex flex-col gap-2 rounded-xl border border-foreground/30 bg-foreground/10 p-6"
    >
      <p className="text-2xl font-bold">{de.customers.archive.bannerHeading}</p>
      <p data-testid="archived-reason" className="max-w-prose text-lg whitespace-pre-line">
        {/* The pair is written together and never cleared (US-10.2), so only a hand-edited row can
            arrive with one of them missing — and then the record says so rather than inventing one. */}
        {archivedAt === null || reason === null
          ? de.customers.archive.bannerNoReason
          : de.customers.archive.bannerDetail(germanDate(archivedAt), reason)}
      </p>
      <p className="max-w-prose text-foreground/80">{de.customers.archive.bannerReadOnly}</p>
    </section>
  );
}

/** The household of an archived record: the same rows and the same figures, with nothing to type in. */
function HouseholdReadOnly({ view }: { view: CustomerCardView }): React.ReactElement {
  const { composition, household, allowance } = view;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Derived
          label={de.customers.derived.grownUps}
          value={String(composition.grownUps)}
          testId="grown-ups"
        />
        <Derived
          label={de.customers.derived.children}
          value={String(composition.children)}
          testId="children"
        />
        <Derived
          label={de.customers.derived.portions}
          value={String(allowance.portions)}
          testId="portions"
        />
        <Derived
          label={de.customers.derived.price}
          value={formatEuros(allowance.priceCents)}
          testId="price"
        />
      </div>
      <ul className="flex flex-col gap-1">
        {household.map((member, index) => (
          // Two members can share a name and a birthdate, so the position is the only key there is.
          <li key={index} data-testid="household-member" className="text-foreground/80">
            {member.firstName} {member.lastName} — {germanDate(member.birthDate)} (
            {de.customers.card.memberAge(member.age)})
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground/60">{de.customers.derived.hint}</p>
      <p className="text-xs text-foreground/60">{de.customers.derived.standardValues}</p>
    </>
  );
}

/**
 * The hand-out history, newest first (US-16.5).
 *
 * The price on each row is the record's own, captured when the hand-out was written: a policy change
 * since then must not rewrite what a household paid last March (US-05, FR-2).
 */
function History({ records }: { records: ReadonlyArray<DistributionRecord> }): React.ReactElement {
  const words = de.customers.record;
  if (records.length === 0) {
    return (
      <p data-testid="history-empty" className="max-w-prose text-foreground/80">
        {words.historyEmpty}
      </p>
    );
  }

  return (
    <>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-foreground/20">
            <th className="py-2 pr-4 font-medium">{words.historyColumns.date}</th>
            <th className="py-2 pr-4 font-medium">{words.historyColumns.showedUp}</th>
            <th className="py-2 pr-4 font-medium">{words.historyColumns.paid}</th>
            <th className="py-2 pr-4 font-medium">{words.historyColumns.price}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} data-testid="history-row" className="border-b border-foreground/10">
              <td className="py-2 pr-4 tabular-nums">{germanDate(record.date)}</td>
              <td className="py-2 pr-4">{record.showedUp ? words.yes : words.no}</td>
              <td data-testid="history-paid" className="py-2 pr-4">
                {record.paid ? words.yes : words.no}
              </td>
              <td data-testid="history-price" className="py-2 pr-4 tabular-nums">
                {formatEuros(record.priceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="max-w-prose text-xs text-foreground/60">{words.historyHint}</p>
    </>
  );
}

function CustomerRecord({
  view,
  settings,
}: {
  view: CustomerCardView;
  settings: Settings;
}): React.ReactElement {
  const { customer, household, cardNumber, nextCardNumber, groupCounts } = view;
  const { details } = customer;
  const archived = customer.status === "ARCHIVED";
  const words = de.customers.record;
  // The four per-head values the household editor derives its live figures from, and nothing more:
  // the quota and the week anchor have no bearing on what a household receives.
  const policy: AllowanceValues = {
    portionsPerGrownUp: settings.portionsPerGrownUp,
    portionsPerChild: settings.portionsPerChild,
    pricePerGrownUp: settings.pricePerGrownUp,
    pricePerChild: settings.pricePerChild,
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{de.customers.card.heading}</h1>
        <p className="text-xl">
          {details.firstName} {details.lastName}
        </p>
      </header>

      {archived ? (
        <ArchivedBanner archivedAt={customer.archivedAt} reason={customer.archiveReason} />
      ) : null}

      <Section heading={words.masterDataHeading}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={de.customers.fields.customerNumber}
            value={String(customer.customerNumber)}
          />
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.fields.cardNumber}: </span>
            <span data-testid="card-number" className="font-medium tabular-nums">
              {cardNumber}
            </span>
          </p>
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.fields.status}: </span>
            <span data-testid="customer-status" className="font-medium">
              {de.customers.status[customer.status]}
            </span>
          </p>
          {/* The household's start is their first card, not the one they hold: a card replaced after
              a loss must not read as a later registration date (US-10.1). */}
          <Field label={de.customers.card.registered} value={germanDate(customer.registeredOn)} />
          {/* Shown only when there is something to see. A zero would be one more number to read past
              on every record, and it says nothing an archiving decision could rest on (PRD §5). */}
          {view.consecutiveNoShows === 0 ? null : (
            <Derived
              label={de.customers.derived.noShows}
              value={de.customers.derived.noShowsValue(view.consecutiveNoShows)}
              testId="no-shows"
            />
          )}
        </div>
      </Section>

      <Section heading={words.detailsHeading}>
        {archived ? (
          <>
            <Field label={de.customers.fields.birthDate} value={germanDate(details.birthDate)} />
            <p>
              {details.address.street} {details.address.houseNumber}
            </p>
            <p>
              {details.address.zip} {details.address.city}
            </p>
          </>
        ) : (
          <DetailsEditor
            customerId={customer.id}
            details={{
              firstName: details.firstName,
              lastName: details.lastName,
              // Written as ISO on the server: read in the browser's own zone, a midnight-UTC day
              // lands on the day before.
              birthDate: isoDay(details.birthDate),
              street: details.address.street,
              houseNumber: details.address.houseNumber,
              zip: details.address.zip,
              city: details.address.city,
            }}
          />
        )}
      </Section>

      <Section heading={de.customers.card.householdHeading}>
        {archived ? (
          <HouseholdReadOnly view={view} />
        ) : (
          <HouseholdEditor
            customerId={customer.id}
            members={household.map((member) => ({
              firstName: member.firstName,
              lastName: member.lastName,
              birthDate: isoDay(member.birthDate),
            }))}
            today={view.today}
            policy={policy}
          />
        )}
      </Section>

      <Section heading={words.groupHeading}>
        {archived ? (
          <Field label={de.customers.fields.group} value={de.customers.groups[customer.group]} />
        ) : (
          <GroupControl customerId={customer.id} group={customer.group} counts={groupCounts} />
        )}
      </Section>

      <Section heading={de.customers.card.certificateHeading}>
        <p>
          {details.certificate.type} — {de.customers.card.validUntil}{" "}
          {germanDate(details.certificate.validUntil)}
        </p>
        <p className="text-foreground/80">
          <span className="text-sm text-foreground/70">{de.customers.card.reminderCount}: </span>
          <span data-testid="reminder-count" className="font-medium tabular-nums">
            {customer.reminderCount}
          </span>
        </p>
        {archived ? null : <RenewalForm customerId={customer.id} />}
      </Section>

      <Section heading={words.notesHeading}>
        {archived ? (
          <p
            data-testid="notes-text"
            className="max-w-prose whitespace-pre-line text-foreground/80"
          >
            {details.notes === "" ? words.notesEmpty : details.notes}
          </p>
        ) : (
          <NotesEditor customerId={customer.id} notes={details.notes} />
        )}
      </Section>

      <Section heading={words.historyHeading}>
        <History records={view.history} />
      </Section>

      {/* Every irreversible action on one household, together and behind a heading that says what
          they are — so none of them is a stray click away from the household editor (PRD §6). Each
          keeps its own confirmation. An archived household is offered none of the three: there is no
          way back out of ARCHIVED, they hold no slot and they are issued no card. */}
      {archived ? null : (
        <Section heading={words.dangerHeading}>
          <p className="max-w-prose text-sm text-foreground/70">{words.dangerHint}</p>

          <div className="flex flex-col gap-3 rounded-xl border border-foreground/20 p-4">
            <h3 className="text-lg font-semibold">{de.customers.reissue.heading}</h3>
            <ReissueControls
              customerId={customer.id}
              cardNumber={cardNumber}
              nextCardNumber={nextCardNumber}
            />

            <h3 className="text-lg font-semibold">{de.customers.block.heading}</h3>
            {customer.status === "BLOCKED" ? (
              <p className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2 whitespace-pre-line">
                <span className="text-sm text-foreground/70">
                  {de.customers.block.currentReason}:{" "}
                </span>
                <span data-testid="block-reason-current" className="font-medium">
                  {customer.blockReason}
                </span>
              </p>
            ) : null}
            <BlockControls
              customerId={customer.id}
              status={customer.status}
              blockReason={customer.blockReason}
            />

            <h3 className="text-lg font-semibold">{de.customers.archive.heading}</h3>
            <ArchiveControls
              customerId={customer.id}
              customerNumber={customer.customerNumber}
              status={customer.status}
            />
          </div>
        </Section>
      )}

      <div className="flex flex-wrap gap-6">
        <Link
          href={`/kunden/${customer.id}/karte`}
          className="underline underline-offset-4"
          data-testid="card-view-link"
        >
          {de.customers.card.cardViewLink}
        </Link>
        <Link href="/" className="underline underline-offset-4">
          {de.customers.card.backToHome}
        </Link>
      </div>
    </main>
  );
}

export default async function CustomerRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // A URL is typed by hand as easily as it is clicked, so a non-numeric id is the same answer as an
  // id nobody holds: there is no such customer.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return <NotFound />;
  }

  // Only the reads are guarded: a `try` around the JSX would catch nothing anyway, because React
  // renders the component after this function has already returned. The settings are read beside the
  // record because the household editor derives its figures in the browser and needs the four
  // per-head values to do it; an unseeded database already takes this screen down through
  // `readCustomer`, so this adds no failure of its own.
  let view: CustomerCardView;
  let settings: Settings;
  try {
    [view, settings] = await Promise.all([
      readCustomer(customerDeps, numericId),
      readCurrentSettings(customerDeps),
    ]);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "CustomerNotFound") {
      return <NotFound />;
    }
    throw error;
  }

  return <CustomerRecord view={view} settings={settings} />;
}
