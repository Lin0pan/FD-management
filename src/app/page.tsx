/**
 * The Start dashboard (tasks/prd-us-17-navigation-shell.md §US-17.3).
 *
 * It used to be a list of seven links, which is what a program looks like before it has navigation.
 * The bar carries those now, so this screen answers the question staff actually open it for: what
 * day is it, when is the next Ausgabe, and which group collects. Nothing on it needs clicking.
 *
 * The date only — no clock time. That is what keeps this a plain server component: no client
 * boundary, no ticking state, no timer, and a page that renders the same under the fixed clock the
 * end-to-end suite pins. `now` comes from the injected `Clock` through `getWeekColour`, never from a
 * wall-clock read here (CLAUDE.md: time is injected).
 *
 * The free-slot banner and the cards-due badge used to stand here; they moved to the hub in
 * US-17.2, where the rest of the customer administration is. Nothing was dropped, and this screen
 * stopped being a to-do list.
 */

import Link from "next/link";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import { DomainError } from "@/domain/errors";
import type { WeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { germanLongDate } from "@/i18n/format";
import { distributionDeps } from "./ausgabe/deps";

/** The date and the next distribution both turn over at midnight without anything being written. */
export const dynamic = "force-dynamic";

/** The group's colour, matching the customer list and the card so they read as the same thing. */
const GROUP_STYLES: Record<WeekColour, string> = {
  RED: "border-red-600/40 bg-red-600/10",
  BLUE: "border-blue-700/40 bg-blue-700/10",
};

/**
 * The distribution panel, painted in the colour of the distribution it *names*.
 *
 * `nextDistribution.colour`, never `view.colour`: the two are the same field only until the week's
 * distribution has been and gone. With a Thursday distribution, on a Saturday "diese Woche ist Rot"
 * and "die nächste Ausgabe ist Blau" are both true, and only the second answers the question this
 * screen exists for (PRD §6). The date beside it comes from the same pair, so the colour cannot be
 * read against a day it does not belong to.
 */
function DistributionPanel({ view }: { view: WeekColourView }): React.ReactElement {
  const { date, colour } = view.nextDistribution;

  return (
    <section
      data-testid="next-distribution"
      className={`flex flex-col gap-2 rounded-xl border p-6 ${GROUP_STYLES[colour]}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        {de.home.distribution.heading}
      </h2>
      {/* The group is in the sentence, not only in the paint: FD read this across a shared screen
          in whatever light the hall has (US-03.4). */}
      <p className="text-2xl font-medium">
        {view.isDistributionDay
          ? de.home.distribution.isToday(de.distribution.colours[colour])
          : de.home.distribution.next(germanLongDate(date), de.distribution.colours[colour])}
      </p>
    </section>
  );
}

/** What stands in the panel's place before FD has configured anything at all (FR-10). */
function NotConfigured(): React.ReactElement {
  return (
    <section
      data-testid="distribution-not-configured"
      className="flex flex-col gap-3 rounded-xl border border-foreground/20 p-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        {de.home.distribution.heading}
      </h2>
      <p className="max-w-prose">{de.home.distribution.notConfigured}</p>
      <Link href="/einstellungen" className="self-start underline underline-offset-4">
        {de.home.settingsLink}
      </Link>
    </section>
  );
}

/**
 * Today's colours, or `null` when no settings version is in force.
 *
 * An unseeded database has no distribution rhythm, and that must cost the panel rather than the
 * screen: a staff member who has just installed the application meets the dashboard first, and an
 * error page there says the software is broken when in fact it is empty.
 */
async function today(): Promise<WeekColourView | null> {
  try {
    return await getWeekColour(distributionDeps);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return null;
    }
    throw error;
  }
}

export default async function Home(): Promise<React.ReactElement> {
  const view = await today();
  // The looked-up day when there is one, and the injected clock's day when there is not — the date
  // line is the half of this screen that does not depend on FD having configured anything.
  const date = view?.date ?? distributionDeps.clock.now();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.home.heading}</h1>
      <p className="max-w-prose text-foreground/70">{de.home.welcome}</p>
      <p data-testid="today-date" className="text-xl">
        {de.home.today(germanLongDate(date))}
      </p>
      {view === null ? <NotConfigured /> : <DistributionPanel view={view} />}
    </main>
  );
}
