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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { GROUP_STYLES } from "../../accents";
import { Confirmation } from "../../notice";
import { NoticeBoard } from "../../notice-board";
import { ARCHIVED } from "../archived-flag";
import { SHELL } from "../../shell";
import { Stat } from "../../stat";
import { ArchiveControls } from "../archive-controls";
import { BlockControls } from "../block-controls";
import { customerDeps } from "../deps";
import { STATUS_CHROME, StateWord } from "../state-word";
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
 * A label and its value as one fact, read in passing. A `<p>`, not two stacked `<div>`s: split, a
 * screen reader reads "Kundennummer" and then "13" with nothing joining them (guide trap 2).
 *
 * This is the record's *one* inline idiom, and the screen used to have three of them: this one, and
 * two hand-rolled copies of the same two spans for the reminder tally and the no-show run. It also
 * used to wear `rounded-lg bg-muted/50 px-4 py-3` — the exact chrome of a `Stat` tile — while
 * saying its value inline at 14px. Two components that look identical and read differently is worse
 * than two that look different, so the fill goes where it means something: a **tile is a figure that
 * drives a decision**, and everything else is a line.
 *
 * The colon stays, and is not an inconsistency with the tiles above: a stacked label needs no
 * separator because the line break is one, and an inline label does.
 */
function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}): React.ReactElement {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span data-testid={testId} className="font-medium tabular-nums">
        {value}
      </span>
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
      {/*
       * A box of its own, so the record is the same shape whether a household has three hand-outs or
       * three hundred. Measured against an inflated register, 130 rows — five years at the
       * fortnightly cycle — took the opened record from 1 536px to 6 457px, and ten years doubles
       * that again. It is not a performance problem (~19ms), so nothing here paginates or
       * virtualises: every row stays in the DOM and browser find still crosses the whole history.
       *
       * The scrollport is the `Table` primitive's *own* container, which is what `containerProps`
       * exists for. A second wrapper around it would nest two overflow contexts, and that is exactly
       * what made the sticky header on /kunden take three attempts
       * (`docs/ui_conversion_guide.md`, "A sticky table header inside a scroll container does not
       * stick").
       *
       * `tabIndex` is a requirement rather than a polish item: a scrollable region that cannot take
       * focus cannot be scrolled by keyboard at all (WCAG 2.1.1). It therefore needs a name, hence
       * the `role` and the label.
       *
       * The print overrides matter for the one occasion this table is put on paper — a disputed
       * visit. An overflow box otherwise prints only the slice that happened to be visible.
       */}
      <Table
        containerClassName="max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible"
        containerProps={{ tabIndex: 0, role: "region", "aria-label": words.historyRegionLabel }}
      >
        {/* `top-0`, not the `top-12` /kunden uses: there the scrollport is the window and the sticky
            nav has to be cleared, here it is the container above and there is nothing to clear.
            `bg-card` and opaque, or the rows read through the header. */}
        <TableHeader className="sticky top-0 z-10 bg-card">
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
  justRegistered,
  justArchived,
}: {
  view: CustomerCardView;
  settings: Settings;
  /** Whether this record was arrived at straight from a registration — see `CustomerRecordPage`. */
  justRegistered: boolean;
  /** Whether the archive control on this record was what brought the page back — same mechanism. */
  justArchived: boolean;
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
    // Eight write controls stand on this record, and each used to keep its own last answer until the
    // page was left. The board holds them to one at a time: the answer to the last thing asked, and
    // nothing older (`notice-board.tsx`).
    <NoticeBoard>
      <main className={SHELL}>
        {/*
         * The `h1` is the household, not the screen. Every record used to be headed
         * "Kundenübersicht" with the name as a `<p>` below it — but the navigation bar already says
         * which section you are in, and the one thing this page has that no other page has is *which
         * household*. The status and the group are badges beside it, using the same chrome table
         * as /kunden.
         *
         * The heading row carries the name and nothing else, and stays *outside* a card, as the
         * heading row does on all seven screens (`docs/ui_conversion_guide.md`, "Page skeleton"). A
         * heading needs no boundary; the facts under it do — which is why they have their own, below.
         *
         * `customer-status` keeps its exact text in a span of its own, and the badge wraps that span
         * rather than replacing it.
         */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {details.firstName} {details.lastName}
            </h1>
            {/* `variant="outline"`, as on /kunden and /karten-neuausstellung. Without it the badge
              takes the `default` variant — `bg-primary text-primary-foreground` — and
              `GROUP_STYLES` then overrides only the *background*, leaving white text on a 10%
              tint. The colour word is the datum here (guide rule 9), so it has to be legible;
              `outline` sets `text-foreground` and lets the tint be the tint. */}
            <Badge variant="outline" className={GROUP_STYLES[customer.group]}>
              {de.customers.groups[customer.group]}
            </Badge>
            <StateWord
              word={de.customers.status[customer.status]}
              testId="customer-status"
              chrome={STATUS_CHROME[customer.status]}
            />
          </div>
          {/* The guide's stated exception to "no back-links": this one names a *record* — this
            household's printed card — which the four-item bar cannot say. It belongs in the header
            row rather than stranded under the danger zone.

            `ghost`, because it only navigates; the record's borders are spent on the eight controls
            below that write. The header's `justify-between` has already pushed it clear of the name
            and the badges, which is the separation a borderless control needs to read as one. */}
          <Button variant="ghost" asChild>
            <Link href={`/kunden/${customer.id}/karte`} data-testid="card-view-link">
              {de.customers.card.cardViewLink}
            </Link>
          </Button>
        </header>

        {/* Above the identity card rather than in the banner slot the archived and blocked notices
          share below it. Those two are facts about the household, and they belong beside the rest of
          what the record knows; this is feedback about the act that just happened, and it is read
          once and never again. A staff member who has pressed "Aufnehmen" is asking "did that
          work?", so it answers before the screen starts stating numbers.

          It is deliberately not a heading, so the record still announces as `h1` → the sections'
          `h2`s (`docs/ui_conversion_guide.md`, trap 1); the `role="status"` inside `Confirmation` is
          what carries it to a screen reader. */}
        {justRegistered ? (
          <Confirmation text={de.customers.new.saved} testId="registration-confirmation" />
        ) : null}

        {/* The same slot, for the write at the other end of a household's life. Two sentences say
            the outcome here — this one and the archived banner below — and they are not a repetition:
            this one is the answer to a click and names the number that just came free, and that one
            is a standing fact about the household that will be there in a year. The control that
            asked is 2 200px below both, which is why the archive navigates rather than confirming in
            place (`archived-flag.ts`). */}
        {justArchived ? (
          <Confirmation
            text={de.customers.archive.saved(customer.customerNumber)}
            testId="archive-saved"
          />
        ) : null}

        {/* Who this household is, in a card of its own — the counter's customer card and the printed
          card's header, one rank down at 24px against their 36 and 48.
          `docs/ui_redesign_kunden_record.md` §3.8 built this as a 14px muted line under the name,
          modelled on the counter's subtitle of the day; the counter has since moved and the line
          did not, so the same two facts were 36px on one screen and body text on the other.

          It gets a ring for the reason every other block on this page has one: `--background` and
          `--card` are the same white, so a `Card` is *only* its ring, and a run of label/value
          pairs with no ring has nothing at all saying where it begins and ends. Bare, it read as
          lost between the heading and the first section. The `h1` above needs no such boundary —
          a heading is its own — which is why the card starts here rather than wrapping both: this
          screen must not become the only one whose heading sits inside a card.

          No `CardTitle`, deliberately. §4.2b dissolved "Stammdaten" as a section on the argument
          that these facts read better without a heading over them, and that still holds; what came
          back is a boundary, not the section — and one container, not the four grey boxes that
          decision actually removed.

          Two tiles and not three: the registration date was tried as a peer and, being the longest
          string, came out the widest and boldest thing in the row — the least-read fact drawing the
          eye first. It is a line below instead, which also makes this pair exactly the pair the
          counter states. The household's start is their *first* card, not the one they hold: a card
          replaced after a loss must not read as a later registration date (US-10.1). */}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label={de.customers.fields.customerNumber}
                value={String(customer.customerNumber)}
                testId="customer-number"
                valueClassName="text-2xl"
              />
              <Stat
                label={de.customers.fields.cardNumber}
                value={cardNumber}
                testId="card-number"
                valueClassName="text-2xl"
              />
            </div>
            <Field
              label={de.customers.card.registered}
              value={germanDate(customer.registeredOn)}
              testId="registered-on"
            />
            {/* Shown only when there is something to see. A zero would be one more number to read
              past on every record, and it says nothing an archiving decision could rest on — which
              is also why it stays a line while the two facts above it are tiles: it is the
              exception, and it should not look like one more thing every household has. */}
            {view.consecutiveNoShows === 0 ? null : (
              <Field
                label={de.customers.derived.noShows}
                value={de.customers.derived.noShowsValue(view.consecutiveNoShows)}
                testId="no-shows"
              />
            )}
          </CardContent>
        </Card>

        {archived ? (
          <ArchivedBanner archivedAt={customer.archivedAt} reason={customer.archiveReason} />
        ) : null}

        {/* The fact belongs where states are stated; the control stays behind the heading that says
          it is irreversible. It was 2 609px below the status it explains — the same split /kunden
          and the counter already make, arriving on the screen you go to to find out what happened. */}
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

        {/*
         * The sections are ordered the way a record is *read*, which is not the order it is written.
         *
         * The previous order — who this is, where they live, who lives with them, what they may
         * collect — was documented as deliberate, and for a paper record it is right. On screen it
         * put the least-read section, the address, 480px above the most-read one, and it put the
         * certificate and the note — which both exist for the counter — below 2 100px. FD were asked
         * and chose the reading order. Nothing is removed and nothing is renamed; only the order
         * changes, and it is trivially reversible.
         */}
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

        <Section heading={de.customers.card.certificateHeading}>
          <p>
            {details.certificate.type} — {de.customers.card.validUntil}{" "}
            {germanDate(details.certificate.validUntil)}
          </p>
          <Field
            label={de.customers.card.reminderCount}
            value={String(customer.reminderCount)}
            testId="reminder-count"
          />
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

        <Section heading={words.groupHeading}>
          {archived ? (
            <Field label={de.customers.fields.group} value={de.customers.groups[customer.group]} />
          ) : (
            <GroupControl customerId={customer.id} group={customer.group} counts={groupCounts} />
          )}
        </Section>

        {/* A disclosure, per FD: on a two-year-old record this is fifty rows of something consulted
          only when a visit is disputed, and nothing in the suite reaches it (§3.12), so unlike the
          archive search it can genuinely be closed. */}
        <Card>
          <details>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <CardHeader>
                <CardTitle>
                  <h2>{words.historyHeading}</h2>
                </CardTitle>
                <CardDescription>{words.historyDisclosure}</CardDescription>
              </CardHeader>
            </summary>
            <CardContent className="mt-6 flex flex-col gap-4">
              <History records={view.history} />
            </CardContent>
          </details>
        </Card>

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
                {/* The reason is stated once, under the header — duplicating it here would make
                  `block-reason-current` strict-mode-ambiguous as well as saying it twice. */}
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
                  returnTo={`/kunden/${customer.id}`}
                />
              </div>
            </div>
          </Section>
        )}
      </main>
    </NoticeBoard>
  );
}

export default async function CustomerRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /**
   * `aufgenommen=1` is set by the two actions that register a household — the registration screen
   * and the waiting-list promotion — because both redirect here and neither can hand the record page
   * anything else. A param rather than a cookie: it is one boolean, it is honest about how the page
   * was reached, and a server component cannot clear a cookie it has read.
   *
   * It follows that reloading that URL confirms again. That is the price of the simplest thing that
   * works, and it is paid by an act nobody repeats.
   */
  searchParams: Promise<{ aufgenommen?: string | string[]; [ARCHIVED]?: string | string[] }>;
}): Promise<React.ReactElement> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
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

  return (
    <CustomerRecord
      view={view}
      settings={settings}
      justRegistered={query.aufgenommen === "1"}
      justArchived={query[ARCHIVED] === "1"}
    />
  );
}
