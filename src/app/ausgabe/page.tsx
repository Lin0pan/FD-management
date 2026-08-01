/**
 * The distribution screen — the counter.
 *
 * Two questions are answered here. Which group collects today — stated in words *and* painted, never
 * painted alone, because staff read it across a shared screen in variable lighting
 * (tasks/prd-us-03-week-colour.md §US-03.4), and only on a distribution day, because on the four
 * days out of five that are not one there is no group to collect. And: may *this* person collect,
 * for the number a staff member just typed (tasks/prd-us-04-lookup-customer.md §US-04.4) — the one
 * question that is unmissable every day.
 *
 * Nothing is computed here. `getWeekColour` and `lookupCustomer` answer; this page lays the answers
 * out. Both are reads — turning someone away records nothing (FR-4) — so a plain GET form carries
 * the query in the URL, which also means Enter reloads the page with the input empty and focused
 * again, ready for the next customer in the queue.
 *
 * The screen answers about *now* and about nothing else. It once carried a second card that looked
 * up the colour of any day; FD said they do not need it, so US-22 withdrew the requirement
 * (tasks/prd-us-22-drop-week-colour-lookup.md). A `?datum=` still in someone's history is read by
 * nobody now — deliberately inert rather than an error. `getWeekColour`'s date parameter stays: it
 * is what `lookupCustomer` and `recordAttendance` pass their instant to.
 */

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { lookupCustomer, type CounterLookup } from "@/application/customers/lookup-customer";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import {
  readGroupRoster,
  type GroupRosterView,
} from "@/application/distribution/read-group-roster";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { DomainError } from "@/domain/errors";
import type { WeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate, germanTime, isoWeekNumber } from "@/i18n/format";
import { ArchiveControls } from "../kunden/archive-controls";
import { BlockControls } from "../kunden/block-controls";
import { CertificateControls } from "./certificate-controls";
import { CustomerDetails, VerdictBanner } from "./counter-lookup";
import { distributionDeps } from "./deps";
import { ServeControls } from "./serve-controls";
import { GROUP_STYLES } from "../accents";
import { SHELL } from "../shell";

/**
 * Whether a verdict permits recording a hand-out. Only the two clear-to-serve outcomes do — an
 * expired certificate serves and reminds, it does not refuse (US-06) — and the use case re-checks
 * this before writing, so hiding the button here is a courtesy, not the guard (FR-8).
 */
function permitsServing(verdict: Verdict): boolean {
  return verdict.kind === "CLEAR_TO_SERVE" || verdict.kind === "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED";
}

/** The colour turns over at midnight and settings change under the screen, so never cache it. */
export const dynamic = "force-dynamic";

/**
 * The group's colour, matching the customer card so the two are recognisably the same thing.
 *
 * Deliberately literal palette values rather than theme tokens: RED and BLUE are the printed cards
 * FD hands out, not a semantic role the theme could re-map. Everything else on this screen is styled
 * from the design tokens.
 */
const COLOUR_STYLES = {
  RED: "bg-red-600 text-white",
  BLUE: "bg-blue-700 text-white",
} as const;

/** The German sentence for a domain error this screen can provoke. */
function messageFor(error: DomainError): string {
  return error.code === "NoSettingsInForce"
    ? de.distribution.errors.noSettings
    : de.distribution.errors.invalidAnchor;
}

function colourName(colour: WeekColour): string {
  return de.distribution.group(de.distribution.colours[colour]);
}

/**
 * What today means for the counter — compact, and loud only on the day it can be acted on.
 *
 * The group is named and painted on a distribution day and on no other. It used to be the loudest
 * thing on the screen every day of the week, which said "Gruppe Rot" to staff who cannot serve
 * anybody today and pushed the number field — the reason this screen exists — down the page. Off-day
 * the group still appears, but only inside the sentence that also names the *date* it belongs to, so
 * neither a word nor a paint can be read as "the group collecting now".
 *
 * Everything named in prose takes its colour and date from `view.nextDistribution`, never
 * `view.colour`: after a Thursday distribution the current week is still Rot while the next
 * distribution is already Blau, and only the second answers the question this screen is read for.
 * FR-7 holds throughout — the group is written out in words wherever it is painted, and the paint
 * only repeats what the words already say.
 *
 * The one place `view.colour` does appear is the badge beside the calendar week, and it is the badge
 * *because* the two can disagree: the week is a property of the calendar, like the week number it
 * sits next to, while the sentence above it is about a hand-out on a named date. On a distribution
 * day they are necessarily the same colour, so the badge is left off rather than repeat the headline
 * in miniature on the paint it is already wearing.
 */
function Banner({ view }: { view: WeekColourView }): React.ReactElement {
  const { date, colour } = view.nextDistribution;
  const meta = `${germanDate(view.date)} · ${de.distribution.banner.week(isoWeekNumber(view.isoWeek))}`;

  if (view.isDistributionDay) {
    return (
      <section
        data-testid="week-colour-banner"
        className={`flex flex-col gap-1 rounded-2xl p-5 ring-1 ring-black/10 md:p-6 ${COLOUR_STYLES[colour]}`}
      >
        <p className="text-base font-medium text-white/90">
          {de.distribution.banner.isDistributionDay}
        </p>
        <p data-testid="week-colour-group" className="text-3xl font-bold tracking-tight">
          {colourName(colour)}
        </p>
        <p className="text-sm text-white/80">{meta}</p>
      </section>
    );
  }

  // No paint at all on a day without a distribution: there is no group to act on, so a red or blue
  // card would be the one misleading thing this screen could show. `Card`'s own neutral ring is the
  // border, as it is for the unconfigured panel on the Start screen.
  return (
    <Card data-testid="week-colour-banner">
      {/* `text-base` against the `Card`'s own 14px: this is read at a glance from standing, not from
          a chair like the admin tables the default is tuned for. */}
      <CardContent className="flex flex-col gap-1">
        <p className="text-base font-medium">{de.distribution.banner.noDistributionDay}</p>
        <p data-testid="next-distribution" className="text-base">
          {de.distribution.banner.next(germanDate(date), de.distribution.colours[colour])}
        </p>
        {/* The week's own colour, beside the week it belongs to — the same solid paint as the
            printed card and the customer's group badge, so the three read as one thing. */}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {meta}
          <Badge data-testid="week-colour-week" className={COLOUR_STYLES[view.colour]}>
            {de.distribution.colours[view.colour]}
          </Badge>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * A German sentence explaining why the screen has no answer.
 *
 * Never a verdict: the verdict has its own painted banner. This is either something the installation
 * is missing (no settings in force) or something about what was typed (a number that is not a
 * number).
 */
function ErrorNote({ message, testId }: { message: string; testId: string }): React.ReactElement {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription data-testid={testId} className="max-w-prose">
        {message}
      </AlertDescription>
    </Alert>
  );
}

/** The counter answer for a typed number, or the German sentence explaining why there is none. */
type CounterResult =
  | { readonly lookup: CounterLookup; readonly error: null }
  | { readonly lookup: null; readonly error: string };

/**
 * The verdict for a typed number, or `null` when nothing was typed.
 *
 * Only a number that is not a number is caught: an unassigned one is `NOT_FOUND`, which is an answer
 * rather than a failure. Anything else — no settings in force, an unreadable stored record — is a
 * fault of the installation, not of what was typed, and belongs on the error screen.
 */
async function lookUpNumber(raw: string | string[] | undefined): Promise<CounterResult | null> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  try {
    return { lookup: await lookupCustomer(distributionDeps, raw), error: null };
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "InvalidCardNumber") {
      return { lookup: null, error: de.distribution.counter.errors.notANumber };
    }
    throw error;
  }
}

/** The height the counter row is built to: the field and `Nachschlagen` are deliberately taller. */
const WALK_CONTROL = "h-12 px-6";

/**
 * One step of the walk through the week's group (US-21).
 *
 * A link when there is somewhere to go — a plain GET, so the browser's Back button retraces the
 * queue exactly as it does after a typed lookup — and a *disabled button* when there is not. Not
 * hidden: the end of a group is something staff must be able to see, and a control that vanished
 * would shuffle the row under the hand reaching for it (FR-8).
 */
function WalkControl({
  target,
  label,
  testId,
}: {
  target: number | null;
  label: string;
  testId: string;
}): React.ReactElement {
  if (target === null) {
    return (
      // `type="button"`: it sits inside the lookup form, and a bare <button> there would submit it.
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled
        data-testid={testId}
        className={WALK_CONTROL}
      >
        {label}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="lg" asChild className={WALK_CONTROL}>
      <Link href={`/ausgabe?nummer=${target}`} data-testid={testId}>
        {label}
      </Link>
    </Button>
  );
}

/**
 * The German sentence for where the walk stands.
 *
 * Four states, four sentences, rather than one sentence that hedges: "nothing looked up yet" and
 * "standing on the first number" both leave `Zurück` unavailable but mean different things about
 * where `Weiter` lands, and an empty group is not the same as having walked to the end of one.
 */
function walkHint(roster: GroupRosterView, fromStart: boolean): string {
  const group = colourName(roster.group);
  const hints = de.distribution.walk.hints;

  if (roster.isEmpty) {
    return hints.empty(group);
  }
  if (fromStart) {
    return hints.fromStart(group);
  }
  return roster.next === null ? hints.end(group) : hints.walking(group);
}

/**
 * No back-link beside the heading: the navigation bar in the root layout reaches Start from every
 * screen (US-17.4), so one here would be a second, worse way home.
 */
function PageHeader(): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{de.distribution.heading}</h1>
    </div>
  );
}

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ nummer?: string | string[] }>;
}): Promise<React.ReactElement> {
  const { nummer } = await searchParams;

  let today: WeekColourView;
  try {
    today = await getWeekColour(distributionDeps);
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return (
        <main className={SHELL}>
          <PageHeader />
          <Card>
            <CardContent className="flex flex-col items-start gap-4">
              <ErrorNote message={messageFor(error)} testId="settings-missing" />
              <Button asChild>
                <Link href="/einstellungen">{de.home.settingsLink}</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      );
    }
    throw error;
  }

  // The walk is independent of the lookup — it asks who is in the week's group, not who this number is
  // — so it must not be sequenced behind it. `readGroupRoster` resolves the week's colour a second
  // time; that is a settings read, and passing this view in would tie the two use cases together for
  // one query (PRD §Technical Considerations).
  const [counter, roster] = await Promise.all([
    lookUpNumber(nummer),
    readGroupRoster(distributionDeps, typeof nummer === "string" ? nummer : undefined),
  ]);

  // Where `readGroupRoster` stands when it has no number to stand at: nothing typed, or something
  // typed that is not a number. The same two cases `lookUpNumber` answers `null` for, which is why
  // this is read off the lookup rather than parsed a second time here.
  const walkFromStart = counter === null || counter.lookup === null;

  return (
    <main className={SHELL}>
      <PageHeader />

      <Banner view={today} />

      {/* The counter loop, keyboard only: type the number, press Enter, read the verdict. The form
          navigates, so the input comes back empty and — being autofocused — ready for the next
          customer without touching the mouse. A native `<label>` rather than the shadcn one: this
          form is deliberately server-rendered with no client component, and Radix's label would drag
          a client boundary onto the counter's critical path for nothing. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <h2>{de.distribution.counter.heading}</h2>
          </CardTitle>
          <CardDescription className="max-w-prose">{de.distribution.counter.hint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="counter-input" className="text-sm font-medium">
                {de.distribution.counter.label}
              </label>
              <Input
                // Not `type="number"`: a card number carries a `k`, and a spinner has no meaning here.
                type="text"
                name="nummer"
                id="counter-input"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                data-testid="counter-input"
                className="h-12 w-44 text-2xl tabular-nums md:text-2xl"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6">
              {de.distribution.counter.submit}
            </Button>
            {/* The walk (US-21) belongs on this row because it is the same act as typing a number:
                it decides who the screen is about. It comes *after* `Nachschlagen` so a staff member
                on the keyboard never tabs through navigation to reach the field they type in, and
                both stay `outline` so the row does not read as three equal choices. They are links,
                not submits — nothing here posts. */}
            <WalkControl
              target={roster.previous}
              label={de.distribution.walk.previous}
              testId="walk-previous"
            />
            <WalkControl
              target={roster.next}
              label={de.distribution.walk.next}
              testId="walk-next"
            />
          </form>
          {/* Tinted from GROUP_STYLES, and naming the group in words in the same breath: the walk
              moves through a group the staff member cannot otherwise see, and a colour never
              travels without the word (US-03.4). */}
          <p
            data-testid="walk-hint"
            className={`self-start rounded-lg border px-3 py-2 text-sm ${GROUP_STYLES[roster.group]}`}
          >
            {walkHint(roster, walkFromStart)}
          </p>
        </CardContent>
      </Card>

      {counter === null ? null : counter.lookup === null ? (
        <ErrorNote message={counter.error} testId="counter-error" />
      ) : (
        <>
          <VerdictBanner verdict={counter.lookup.verdict} />
          {counter.lookup.customer === null ? null : (
            <CustomerDetails customer={counter.lookup.customer} />
          )}
          {counter.lookup.customerId === null ? null : (
            <>
              {/* Keyed by customer so a confirmation from one lookup cannot survive into the
                    next customer's screen; within one customer the state rides out revalidation,
                    which is what keeps the renewal confirmation visible once the certificate
                    reads as valid again. */}
              <CertificateControls
                key={counter.lookup.customerId}
                customerId={counter.lookup.customerId}
                expired={counter.lookup.verdict.kind === "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED"}
                reminderLoggedToday={counter.lookup.reminderLoggedToday}
              />
              <ServeControls
                customerId={counter.lookup.customerId}
                canServe={permitsServing(counter.lookup.verdict)}
                todaysRecord={
                  counter.lookup.todaysRecord === null
                    ? null
                    : {
                        recordId: counter.lookup.todaysRecord.recordId,
                        time: germanTime(counter.lookup.todaysRecord.at),
                        paid: counter.lookup.todaysRecord.paid,
                      }
                }
              />
              {/* The way off this screen and onto the whole record (US-16.5). Everything the
                    counter shows is a slice of it, and the question staff most often have next —
                    who else lives there, what was noted, when did they last collect — is answered
                    there and nowhere here. */}
              <Button variant="outline" asChild className="self-start">
                <Link
                  href={`/kunden/${counter.lookup.customerId}`}
                  data-testid="counter-record-link"
                >
                  {de.distribution.counter.recordLink}
                </Link>
              </Button>

              {/* Blocking and archiving are offered here because the reasons for both show up at
                    the counter: the certificate still expired after several reminders, the no-show
                    run above (FR-2), and whatever a household does in front of the person serving
                    them. US-08.4 shipped the block controls on the record only, which left a staff
                    member who had decided at the counter with no route off this screen (US-16.5).
                    Both are the same closed disclosures as on the record, last on the screen and
                    never a prompt: the queue must not have to dismiss anything to get the next
                    customer served (PRD §6). Keyed by customer, like the certificate controls, so
                    nothing typed about one household survives into the next lookup. Still the
                    pre-shadcn disclosures: they are shared with the customer record, so restyling
                    them is that screen's change, not this one's. */}
              {counter.lookup.customer === null ? null : (
                <div className="flex flex-col gap-3">
                  <BlockControls
                    key={`block-${counter.lookup.customerId}`}
                    customerId={counter.lookup.customerId}
                    status={counter.lookup.customer.status}
                    blockReason={counter.lookup.customer.blockReason}
                  />
                  <ArchiveControls
                    key={counter.lookup.customerId}
                    customerId={counter.lookup.customerId}
                    customerNumber={counter.lookup.customer.customerNumber}
                    status={counter.lookup.customer.status}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
