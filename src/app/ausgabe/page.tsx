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

import Link from "next/link";
import { z } from "zod";
import { lookupCustomer, type CounterLookup } from "@/application/customers/lookup-customer";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { DomainError } from "@/domain/errors";
import type { WeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate, germanTime } from "@/i18n/format";
import { CustomerDetails, VerdictBanner } from "./counter-lookup";
import { distributionDeps } from "./deps";
import { ServeControls } from "./serve-controls";

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

/** The group's colour, matching the customer card so the two are recognisably the same thing. */
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
      className={`flex flex-col gap-3 rounded-xl p-10 shadow-sm ${COLOUR_STYLES[colour]}`}
    >
      <p className="text-2xl font-medium">
        {view.isDistributionDay
          ? de.distribution.banner.isDistributionDay
          : de.distribution.banner.noDistributionDay}
      </p>
      <p data-testid="week-colour-group" className="text-6xl font-bold sm:text-7xl">
        {colourName(colour)}
      </p>
      {view.isDistributionDay ? null : (
        <p data-testid="next-distribution" className="text-2xl font-medium">
          {de.distribution.banner.next(
            germanDate(view.nextDistribution.date),
            de.distribution.colours[colour],
          )}
        </p>
      )}
      <p className="text-lg opacity-90">
        {germanDate(view.date)} · {de.distribution.banner.week(view.isoWeek)}
      </p>
    </section>
  );
}

function LookupResult({ lookup }: { lookup: Lookup }): React.ReactElement {
  if (lookup.view === null) {
    return (
      <p data-testid="lookup-error" className="max-w-prose text-foreground/80">
        {lookup.error}
      </p>
    );
  }

  const view = lookup.view;
  return (
    <div data-testid="lookup-result" className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-3 text-lg">
        <span
          className={`rounded-full px-4 py-1 font-semibold ${COLOUR_STYLES[view.colour]}`}
          data-testid="lookup-colour"
        >
          {colourName(view.colour)}
        </span>
        <span>
          {de.distribution.lookup.result(
            germanDate(view.date),
            view.isoWeek,
            de.distribution.colours[view.colour],
          )}
        </span>
      </p>
      <p className="text-foreground/70">
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
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
          <h1 className="text-3xl font-semibold">{de.distribution.heading}</h1>
          <p className="max-w-prose">{messageFor(error)}</p>
          <Link href="/einstellungen" className="underline underline-offset-4">
            {de.home.settingsLink}
          </Link>
        </main>
      );
    }
    throw error;
  }

  const [lookup, counter] = await Promise.all([lookUp(datum), lookUpNumber(nummer)]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-3xl font-semibold">{de.distribution.heading}</h1>

      <Banner view={today} />

      {/* The counter loop, keyboard only: type the number, press Enter, read the verdict. The form
          navigates, so the input comes back empty and — being autofocused — ready for the next
          customer without touching the mouse. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.distribution.counter.heading}</h2>
        <p className="max-w-prose text-foreground/70">{de.distribution.counter.hint}</p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.distribution.counter.label}</span>
            <input
              // Not `type="number"`: a card number carries a `k`, and a spinner has no meaning here.
              type="text"
              name="nummer"
              id="counter-input"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              data-testid="counter-input"
              className="w-40 rounded border border-foreground/20 px-3 py-2 text-2xl tabular-nums"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-foreground/20 px-4 py-2 font-medium"
          >
            {de.distribution.counter.submit}
          </button>
        </form>
        {counter === null ? null : counter.lookup === null ? (
          <p data-testid="counter-error" className="max-w-prose text-foreground/80">
            {counter.error}
          </p>
        ) : (
          <>
            <VerdictBanner verdict={counter.lookup.verdict} />
            {counter.lookup.customer === null ? null : (
              <CustomerDetails customer={counter.lookup.customer} />
            )}
            {counter.lookup.customerId === null ? null : (
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
            )}
          </>
        )}
      </section>

      {/* A plain GET form: the looked-up day belongs in the URL, so a colour staff have checked can
          be reloaded or shared without re-typing it. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{de.distribution.lookup.heading}</h2>
        <p className="max-w-prose text-foreground/70">{de.distribution.lookup.hint}</p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.distribution.lookup.label}</span>
            <input
              type="date"
              name="datum"
              defaultValue={typeof datum === "string" ? datum : ""}
              className="rounded border border-foreground/20 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-foreground/20 px-4 py-2 font-medium"
          >
            {de.distribution.lookup.submit}
          </button>
          {lookup === null ? null : (
            <Link href="/ausgabe" className="underline underline-offset-4">
              {de.distribution.lookup.reset}
            </Link>
          )}
        </form>
        {lookup === null ? null : <LookupResult lookup={lookup} />}
      </section>

      <Link href="/" className="underline underline-offset-4">
        {de.customers.card.backToHome}
      </Link>
    </main>
  );
}
