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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { SHELL } from "../../shell";
import { Stat } from "../../stat";
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

/**
 * A label and its value as one fact. A `<p>`, not two stacked `<div>`s: split, a screen reader
 * reads "Kundennummer" and then "13" with nothing joining them (guide trap 2).
 */
function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p className="rounded-lg bg-muted/50 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

/**
 * A section of the record: one card, one form, one save. A card is what says where a form ends —
 * the screen carries five of them, and their five save buttons used to be five identical slabs at
 * five unpredictable depths with nothing bounding the form each belonged to.
 *
 * The `<h2>` is written out inside `CardTitle`, which is a `div`: without it the record's heading
 * outline would collapse to its `h1` (guide trap 1).
 */
function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function NotFound(): React.ReactElement {
  return (
    <main className={SHELL}>
      <h1 className="text-3xl font-semibold tracking-tight">{de.customers.card.heading}</h1>
      <p className="max-w-prose">{de.customers.errors.notFound}</p>
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
    // The headline is a real `<h2>` — it was a `<p className="text-2xl font-bold">`, so the single
    // most important element of this variant of the screen contributed nothing to the outline and
    // an archived record announced as `h1 → h2 Stammdaten → …` (guide trap 1, from the direction
    // of a heading never written rather than one a primitive deleted).
    //
    // `outline` weight rather than another grey fill on a grey page: being archived is a state, not
    // an alarm — the household is simply gone.
    <Alert
      data-testid="archived-banner"
      className="border-foreground/30 ring-0 [&>div]:flex [&>div]:flex-col [&>div]:gap-2"
    >
      <AlertDescription>
        <h2 className="text-2xl font-bold text-foreground">{de.customers.archive.bannerHeading}</h2>
        <p data-testid="archived-reason" className="max-w-prose text-lg whitespace-pre-line">
          {/* The pair is written together and never cleared (US-10.2), so only a hand-edited row
              can arrive with one of them missing — and then the record says so rather than
              inventing one. */}
          {archivedAt === null || reason === null
            ? de.customers.archive.bannerNoReason
            : de.customers.archive.bannerDetail(germanDate(archivedAt), reason)}
        </p>
        <p className="max-w-prose">{de.customers.archive.bannerReadOnly}</p>
      </AlertDescription>
    </Alert>
  );
}

/** The household of an archived record: the same rows and the same figures, with nothing to type in. */
function HouseholdReadOnly({ view }: { view: CustomerCardView }): React.ReactElement {
  const { composition, household, allowance } = view;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={de.customers.derived.grownUps}
          value={String(composition.grownUps)}
          testId="grown-ups"
        />
        <Stat
          label={de.customers.derived.children}
          value={String(composition.children)}
          testId="children"
        />
        <Stat
          label={de.customers.derived.portions}
          value={String(allowance.portions)}
          testId="portions"
        />
        <Stat
          label={de.customers.derived.price}
          value={formatEuros(allowance.priceCents)}
          testId="price"
        />
      </div>
      {/* The same table as the editable variant, with the values as text — one shape for both, so
          an archived household is read the same way as an active one. A plain `<th scope="row">`
          rather than `Label`, which is `"use client"`: this half of the record is server-rendered
          and has no interactivity to pay a client boundary for. */}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">{de.customers.new.memberNumberColumn}</TableHead>
            <TableHead>{de.customers.fields.firstName}</TableHead>
            <TableHead>{de.customers.fields.lastName}</TableHead>
            <TableHead>{de.customers.fields.birthDate}</TableHead>
            <TableHead className="whitespace-nowrap">{de.customers.record.ageColumn}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {household.map((member, index) => (
            // Two members can share a name and a birthdate, so the position is the only key there is.
            <TableRow key={index} data-testid="household-member" className="hover:bg-transparent">
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell>{member.firstName}</TableCell>
              <TableCell>{member.lastName}</TableCell>
              <TableCell className="tabular-nums">{germanDate(member.birthDate)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {de.customers.card.memberAge(member.age)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">{de.customers.derived.hint}</p>
      <p className="text-xs text-muted-foreground">{de.customers.derived.standardValues}</p>
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
    // An `Alert`, not a bare paragraph: a sentence on its own where a table was expected reads like
    // a table that failed to load — the same reason `waiting-list-empty` became one.
    return (
      <Alert role="status">
        <AlertDescription data-testid="history-empty" className="max-w-prose">
          {words.historyEmpty}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {/* No chrome on "Bezahlt: nein". It is 8 of 42 hand-outs across the demo register, which is a
          badge's worth of rarity — but "Erschienen: nein" is a second exception in the same small
          table and a no-show is not a debt, so two chromes here would be texture rather than
          emphasis. The words already say it, which is the requirement. */}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{words.historyColumns.date}</TableHead>
            <TableHead>{words.historyColumns.showedUp}</TableHead>
            <TableHead>{words.historyColumns.paid}</TableHead>
            <TableHead>{words.historyColumns.price}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id} data-testid="history-row">
              <TableCell className="tabular-nums">{germanDate(record.date)}</TableCell>
              <TableCell>{record.showedUp ? words.yes : words.no}</TableCell>
              <TableCell data-testid="history-paid">{record.paid ? words.yes : words.no}</TableCell>
              <TableCell data-testid="history-price" className="tabular-nums">
                {formatEuros(record.priceCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="max-w-prose text-xs text-muted-foreground">{words.historyHint}</p>
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
    <main className={SHELL}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{de.customers.card.heading}</h1>
        <p className="text-xl">
          {details.firstName} {details.lastName}
        </p>
      </header>

      {archived ? (
        <ArchivedBanner archivedAt={customer.archivedAt} reason={customer.archiveReason} />
      ) : null}

      <Section heading={words.masterDataHeading}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={de.customers.fields.customerNumber}
            value={String(customer.customerNumber)}
          />
          <p className="rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {de.customers.fields.cardNumber}:{" "}
            </span>
            <span data-testid="card-number" className="font-medium tabular-nums">
              {cardNumber}
            </span>
          </p>
          <p className="rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">{de.customers.fields.status}: </span>
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
            <p className="rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {de.customers.derived.noShows}:{" "}
              </span>
              <span data-testid="no-shows" className="font-semibold tabular-nums">
                {de.customers.derived.noShowsValue(view.consecutiveNoShows)}
              </span>
            </p>
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
        <p>
          <span className="text-sm text-muted-foreground">{de.customers.card.reminderCount}: </span>
          <span data-testid="reminder-count" className="font-medium tabular-nums">
            {customer.reminderCount}
          </span>
        </p>
        {archived ? null : <RenewalForm customerId={customer.id} />}
      </Section>

      <Section heading={words.notesHeading}>
        {archived ? (
          <p data-testid="notes-text" className="max-w-prose whitespace-pre-line">
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
          <p className="max-w-prose text-sm text-muted-foreground">{words.dangerHint}</p>

          {/* One card holds the section already, so the inner frame goes: it was one more bordered
              box on a screen whose only bordered things were 22 hairlines. The three `<h3>`s stay —
              they are what says which control is which. */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{de.customers.reissue.heading}</h3>
              <ReissueControls
                customerId={customer.id}
                cardNumber={cardNumber}
                nextCardNumber={nextCardNumber}
              />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{de.customers.block.heading}</h3>
              {customer.status === "BLOCKED" ? (
                <Alert variant="destructive">
                  <AlertDescription className="max-w-prose whitespace-pre-line">
                    <span className="text-sm">{de.customers.block.currentReason}: </span>
                    <span data-testid="block-reason-current" className="font-medium">
                      {customer.blockReason}
                    </span>
                  </AlertDescription>
                </Alert>
              ) : null}
              <BlockControls
                customerId={customer.id}
                status={customer.status}
                blockReason={customer.blockReason}
              />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{de.customers.archive.heading}</h3>
              <ArchiveControls
                customerId={customer.id}
                customerNumber={customer.customerNumber}
                status={customer.status}
              />
            </div>
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
