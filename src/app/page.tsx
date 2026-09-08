/**
 * The Start dashboard (`tasks/prd-us-17-navigation-shell.md` §US-17.3) — three lines and nothing
 * else: the greeting, the date, the Ausgabe. The nav bar carries the links, and the signals live on
 * the hub (US-17.2), so nothing here needs clicking except in the unconfigured state.
 *
 * **The date only, no clock time**, which is what keeps this a plain server component: no client
 * boundary, no ticking state, and a page that renders the same under the fixed clock the e2e suite
 * pins. `now` comes from the injected `Clock` through `getWeekColour`.
 */

import Link from "next/link";
import { getWeekColour, type WeekColourView } from "@/application/distribution/get-week-colour";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanLongDate } from "@/i18n/format";
import { distributionDeps } from "./ausgabe/deps";
import { SHELL } from "./shell";

/** The date and the next distribution both turn over at midnight without anything being written. */
export const dynamic = "force-dynamic";

/**
 * The distribution line: one sentence, set like the date above it, in no container at all. DF asked
 * for no banner and no tint, so the group is carried by the word `(Rot)` / `(Blau)` alone — which
 * loses nothing, the word always having been the part that had to be there (US-03.4).
 *
 * **`nextDistribution.colour`, never `view.colour`**: on a Saturday after a Thursday distribution,
 * "diese Woche ist Rot" and "die nächste Ausgabe ist Blau" are both true, and only the second answers
 * what this screen exists for (PRD §6).
 *
 * The testid stays on a wrapper with exactly one `<p>` inside: `home.spec.ts` asserts its text
 * exactly, so the sentence may neither be split across elements nor joined by a second paragraph.
 */
function DistributionLine({ view }: { view: WeekColourView }): React.ReactElement {
  const { date, colour } = view.nextDistribution;
  const word = de.distribution.colours[colour];

  return (
    <div data-testid="next-distribution">
      <p className="text-xl">
        {view.isDistributionDay
          ? de.home.distribution.isToday(word)
          : de.home.distribution.next(germanLongDate(date), word)}
      </p>
    </div>
  );
}

/**
 * What stands in the line's place before DF has configured anything (FR-10) — the one state in which
 * this screen has something to do, so it keeps a `Card`. Neutral deliberately: there is no group to
 * name, so painting it would be the only false statement the screen could make.
 */
function NotConfigured(): React.ReactElement {
  return (
    <Card data-testid="distribution-not-configured">
      <CardContent className="flex flex-col items-start gap-4 py-2">
        {/* `text-base` against the `Card`'s own 14px: in this state the paragraph *is* the screen,
            and the card default is tuned for dense admin tables read from a chair. */}
        <p className="max-w-prose text-base">{de.home.distribution.notConfigured}</p>
        {/* The only state in which this screen has an action, so the action looks like one rather
            than like a footnote. It stays an `<a>`, which is what the spec asserts the href of —
            and a `<button>` pushing a route would need a client boundary this page must not have. */}
        <Button size="lg" asChild>
          <Link href="/einstellungen">{de.home.settingsLink}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Today's colours, or `null` when no settings version is in force — a cost to the panel rather than
 * the screen: an error page on the first screen after an install says the software is broken when in
 * fact it is empty.
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
  // The looked-up day, or the injected clock's: the date line is the half of this screen that does
  // not depend on DF having configured anything.
  const date = view?.date ?? distributionDeps.clock.now();

  return (
    <main className={SHELL}>
      {/* The greeting is the `h1` — one line, and the whole of the welcome. It is set full strength
          rather than muted now that it is the only thing at the top of the screen. */}
      <h1 className="text-3xl font-semibold tracking-tight">{de.home.heading}</h1>
      {/* The two facts stand together, a line apart rather than a `gap-6` apart: the date is read as
          the qualifier of the Ausgabe below it, not as a section of its own. The empty state keeps
          the shell's full gap, because there the card is a separate thing to act on. */}
      <div className="flex flex-col gap-1">
        <p data-testid="today-date" className="text-xl text-muted-foreground">
          {de.home.today(germanLongDate(date))}
        </p>
        {view !== null && <DistributionLine view={view} />}
      </div>
      {view === null && <NotConfigured />}
    </main>
  );
}
