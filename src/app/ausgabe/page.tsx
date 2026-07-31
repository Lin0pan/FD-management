/**
 * The distribution screen — the counter.
 *
 * Two questions are answered here, both unmissably. Which group collects today: stated in words
 * *and* painted, never painted alone, because staff read it across a shared screen in variable
 * lighting (tasks/prd-us-03-week-colour.md §US-03.4). And: may *this* person collect, for the number
 * a staff member just typed (tasks/prd-us-04-lookup-customer.md §US-04.4).
 *
 * Nothing is computed here. `getWeekColour` and `lookupCustomer` answer; this page lays the answers
 * out. Both are reads — turning someone away records nothing (FR-4) — so a plain GET form carries
 * the query in the URL, which also means Enter reloads the page with the input empty and focused
 * again, ready for the next customer in the queue.
 */

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { lookupCustomer, type CounterLookup } from "@/application/customers/lookup-customer";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { DomainError } from "@/domain/errors";
import type { WeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate, germanTime } from "@/i18n/format";
import { ArchiveControls } from "../kunden/archive-controls";
import { BlockControls } from "../kunden/block-controls";
import { CertificateControls } from "./certificate-controls";
import { CustomerDetails, VerdictBanner } from "./counter-lookup";
import { distributionDeps } from "./deps";
import { ServeControls } from "./serve-controls";
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

/**
 * A calendar day as `<input type="date">` submits it, read as the UTC day it names.
 *
 * The shape check is not enough: `2026-13-45` matches it and parses to an Invalid Date, whose NaN
 * would flow through the calendar arithmetic and be *rendered* — `NaN.NaN.NaN`, week `NaN-WNaN`, and
 * a colour picked by a parity comparison against NaN. The day itself has to be a day. Only the URL
 * can carry one that is not, but that is enough.
 */
const lookupDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value): Date => new Date(`${value}T00:00:00.000Z`))
  .refine((date): boolean => !Number.isNaN(date.getTime()));

/** Either the looked-up day or the German sentence explaining why there is none. */
type Lookup =
  | { readonly view: WeekColourView; readonly error: null }
  | { readonly view: null; readonly error: string };

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
 * The dominant element: what today means for the counter.
 *
 * The banner is painted in the colour it *names* — on a day without a distribution that is the next
 * distribution's colour, which need not be the current week's.
 */
function Banner({ view }: { view: WeekColourView }): React.ReactElement {
  const colour = view.nextDistribution.colour;

  return (
    <section
      data-testid="week-colour-banner"
      className={`flex flex-col gap-2 rounded-2xl p-8 ring-1 ring-black/10 md:p-10 ${COLOUR_STYLES[colour]}`}
    >
      <p className="text-xl font-medium text-white/90 md:text-2xl">
        {view.isDistributionDay
          ? de.distribution.banner.isDistributionDay
          : de.distribution.banner.noDistributionDay}
      </p>
      <p data-testid="week-colour-group" className="text-6xl font-bold tracking-tight sm:text-7xl">
        {colourName(colour)}
      </p>
      {view.isDistributionDay ? null : (
        <p
          data-testid="next-distribution"
          className="text-xl font-medium text-white/90 md:text-2xl"
        >
          {de.distribution.banner.next(
            germanDate(view.nextDistribution.date),
            de.distribution.colours[colour],
          )}
        </p>
      )}
      <p className="text-base text-white/80 md:text-lg">
        {germanDate(view.date)} · {de.distribution.banner.week(view.isoWeek)}
      </p>
    </section>
  );
}

/**
 * A German sentence explaining why a lookup produced nothing.
 *
 * Always a validation message, never a verdict: the verdict has its own painted banner, and these two
 * cases (an unreadable date, a number that is not a number) are about what was typed.
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

function LookupResult({ lookup }: { lookup: Lookup }): React.ReactElement {
  if (lookup.view === null) {
    return <ErrorNote message={lookup.error} testId="lookup-error" />;
  }

  const view = lookup.view;
  return (
    <div data-testid="lookup-result" className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-3 text-base">
        <Badge
          data-testid="lookup-colour"
          className={`h-7 px-3 text-sm font-semibold ${COLOUR_STYLES[view.colour]}`}
        >
          {colourName(view.colour)}
        </Badge>
        <span className="text-foreground">
          {de.distribution.lookup.result(
            germanDate(view.date),
            view.isoWeek,
            de.distribution.colours[view.colour],
          )}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        {view.isDistributionDay
          ? de.distribution.lookup.isDistributionDay
          : de.distribution.lookup.nextDistribution(
              germanDate(view.nextDistribution.date),
              de.distribution.colours[view.nextDistribution.colour],
            )}
      </p>
    </div>
  );
}

/**
 * The colour of a submitted day, or `null` when nothing was asked.
 *
 * The lookup fails on its own: an unreadable date, or a day before FD had any settings, must leave
 * today's banner standing rather than take the screen down with it.
 */
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

async function lookUp(raw: string | string[] | undefined): Promise<Lookup | null> {
  if (typeof raw !== "string" || raw === "") {
    return null;
  }
  const parsed = lookupDate.safeParse(raw);
  if (!parsed.success) {
    return { view: null, error: de.distribution.errors.notADate };
  }
  try {
    return { view: await getWeekColour(distributionDeps, parsed.data), error: null };
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return { view: null, error: messageFor(error) };
    }
    throw error;
  }
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
  searchParams: Promise<{ datum?: string | string[]; nummer?: string | string[] }>;
}): Promise<React.ReactElement> {
  const { datum, nummer } = await searchParams;

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

  const [lookup, counter] = await Promise.all([lookUp(datum), lookUpNumber(nummer)]);

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
        <CardContent>
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
          </form>
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

      {/* A plain GET form: the looked-up day belongs in the URL, so a colour staff have checked can
          be reloaded or shared without re-typing it. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <h2>{de.distribution.lookup.heading}</h2>
          </CardTitle>
          <CardDescription className="max-w-prose">{de.distribution.lookup.hint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lookup-date" className="text-sm font-medium">
                {de.distribution.lookup.label}
              </label>
              <Input
                type="date"
                id="lookup-date"
                name="datum"
                defaultValue={typeof datum === "string" ? datum : ""}
                className="h-9 w-44"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-9">
              {de.distribution.lookup.submit}
            </Button>
            {lookup === null ? null : (
              <Button variant="ghost" asChild className="h-9">
                <Link href="/ausgabe">{de.distribution.lookup.reset}</Link>
              </Button>
            )}
          </form>
          {lookup === null ? null : <LookupResult lookup={lookup} />}
        </CardContent>
      </Card>
    </main>
  );
}
