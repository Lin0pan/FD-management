/**
 * The distribution screen.
 *
 * Its whole job is to make one fact unmissable: which group collects. Staff read it across a shared
 * screen in variable lighting, so the colour is stated in words *and* painted, never painted alone
 * (tasks/prd-us-03-week-colour.md §US-03.4).
 *
 * Nothing is computed here. `getWeekColour` answers for today and, when a date is submitted, for
 * that day as well — the same use case twice, once per question.
 */

import Link from "next/link";
import { z } from "zod";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import { DomainError } from "@/domain/errors";
import type { WeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { distributionDeps } from "./deps";

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
  searchParams: Promise<{ datum?: string | string[] }>;
}): Promise<React.ReactElement> {
  const { datum } = await searchParams;

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

  const lookup = await lookUp(datum);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-3xl font-semibold">{de.distribution.heading}</h1>

      <Banner view={today} />

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
