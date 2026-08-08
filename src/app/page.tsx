/**
 * The Start dashboard (tasks/prd-us-17-navigation-shell.md §US-17.3).
 *
 * It used to be a list of seven links, which is what a program looks like before it has navigation.
 * The bar carries those now, so this screen answers the question staff actually open it for: what
 * day is it, when is the next Ausgabe, and which group collects. Nothing on it needs clicking —
 * except in the one state where DF has configured no rhythm yet, and there the way to the settings
 * is the only thing on the screen worth doing.
 *
 * Three lines and nothing else: the greeting, the date, the Ausgabe. The explanatory paragraph under
 * the heading and the panel's `AUSGABE` eyebrow both went, because each one described the line below
 * it rather than saying anything the line did not.
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
 * The distribution line: one sentence, set like the date above it, in no container at all.
 *
 * It was a tinted card at 40px and then at 30px, which is what §3 of the concept asked for — and
 * seeing it built, DF asked for the opposite: no banner, no tint, and the group as a small note
 * rather than a clause. So the colour is now carried by the word `(Rot)` / `(Blau)` alone. That
 * loses nothing a reader depends on, because the word was always the part that had to be there
 * (US-03.4: never colour alone); it is the paint that has gone, not the fact. `GROUP_STYLES` is
 * therefore no longer imported here — every other screen that names a group still wears it.
 *
 * `nextDistribution.colour`, never `view.colour`: the two are the same field only until the week's
 * distribution has been and gone. With a Thursday distribution, on a Saturday "diese Woche ist Rot"
 * and "die nächste Ausgabe ist Blau" are both true, and only the second answers the question this
 * screen exists for (PRD §6). The date beside it comes from the same pair, so the colour cannot be
 * read against a day it does not belong to.
 *
 * The testid stays on a wrapper with exactly one `<p>` inside it: `home.spec.ts` asserts
 * `getByTestId("next-distribution").locator("p")` with an exact `toHaveText`, so the sentence may
 * neither be split across elements nor joined by a second paragraph (concept §7.1).
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
 * What stands in the line's place before DF has configured anything at all (FR-10).
 *
 * The one state in which this screen has something to do, so it keeps a `Card`: the sentence
 * explains a setup step rather than answering the daily question, and the button under it is the
 * only control on the screen. Neutral, and deliberately — there is no group to name here, so
 * painting it red or blue would be the only false statement the screen could make.
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
  // line is the half of this screen that does not depend on DF having configured anything.
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
