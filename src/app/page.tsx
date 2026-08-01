/**
 * The Start dashboard (tasks/prd-us-17-navigation-shell.md §US-17.3).
 *
 * It used to be a list of seven links, which is what a program looks like before it has navigation.
 * The bar carries those now, so this screen answers the question staff actually open it for: what
 * day is it, when is the next Ausgabe, and which group collects. Nothing on it needs clicking —
 * except in the one state where FD has configured no rhythm yet, and there the way to the settings
 * is the only thing on the screen worth doing.
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanLongDate } from "@/i18n/format";
import { GROUP_STYLES } from "./accents";
import { distributionDeps } from "./ausgabe/deps";
import { SHELL } from "./shell";

/** The date and the next distribution both turn over at midnight without anything being written. */
export const dynamic = "force-dynamic";

/** What the panel's small heading reads as, on both of its states. */
const PANEL_HEADING = "text-sm font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * The sentence with the group's word set apart, still as one string in one paragraph.
 *
 * `home.spec.ts` asserts `getByTestId("next-distribution").locator("p")` with an exact
 * `toHaveText`, so the dictionary sentence may neither be split across elements nor joined by a
 * second `<p>` (concept §7.1). `toHaveText` reads text content and is blind to inline markup, so
 * wrapping the colour word where it already stands costs the assertion nothing — and it is what
 * stops the answer being the seventh of eleven identically set words (§3.1). The word is looked up
 * rather than passed in twice, and a sentence that somehow does not contain it is rendered whole:
 * an unemphasised line is a smaller failure than a line missing its colour.
 */
function withColourEmphasised(sentence: string, colour: string): React.ReactNode {
  const at = sentence.indexOf(colour);
  if (at === -1) {
    return sentence;
  }
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-bold">{colour}</strong>
      {sentence.slice(at + colour.length)}
    </>
  );
}

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
  const word = de.distribution.colours[colour];

  return (
    // `ring-0` before the border: `Card` brings a ring rather than a border, and a card given a
    // coloured edge without turning the ring off wears two outlines a pixel apart.
    <Card data-testid="next-distribution" className={`ring-0 border ${GROUP_STYLES[colour]}`}>
      <CardHeader>
        {/* `CardTitle` is a `div`, so the real `<h2>` stays inside it — without it the screen's
            heading outline loses its only section (`docs/ui_conversion_guide.md`, trap 1). */}
        <CardTitle className={PANEL_HEADING}>
          <h2>{de.home.distribution.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* The group is in the sentence, not only in the paint: FD read this across a shared screen
            in whatever light the hall has (US-03.4). Exactly one `<p>`, and nothing else in this
            card may be one — a `Stat` here is a strict-mode violation on three assertions (§7.1).

            40px because this is the one screen in the application that is read from across a hall
            rather than by somebody at the keyboard; how much bigger the word itself wants to be is
            a question for FD in front of the live screen (concept §11.1).

            No `text-balance`, though the concept offers it: at 40px the sentence needs ~1 300px and
            the panel is 1 088, so it wraps at every width — and balancing measures out two even
            lines by breaking the date, `Donnerstag, 6.` over `August 2026`. Left alone it breaks
            after the dash instead (931px / 371px), which is the one place §9 asks for: each of the
            two facts whole on a line of its own. */}
        <p className="text-[2.5rem] leading-tight font-medium">
          {withColourEmphasised(
            view.isDistributionDay
              ? de.home.distribution.isToday(word)
              : de.home.distribution.next(germanLongDate(date), word),
            word,
          )}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * What stands in the panel's place before FD has configured anything at all (FR-10).
 *
 * No colour, and deliberately: there is no group to name here, so painting this state red or blue
 * would be the only false statement the screen could make. `Card`'s own neutral ring is the border.
 */
function NotConfigured(): React.ReactElement {
  return (
    <Card data-testid="distribution-not-configured">
      <CardHeader>
        <CardTitle className={PANEL_HEADING}>
          <h2>{de.home.distribution.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
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
  // line is the half of this screen that does not depend on FD having configured anything.
  const date = view?.date ?? distributionDeps.clock.now();

  return (
    <main className={SHELL}>
      {/* The application's name, on the screen of the application, under a bar that already says
          `Start`: it stays, because it is the `h1` and the heading outline needs it — it just stops
          being the loudest voice in a room where it has nothing to say. */}
      <h1 className="text-2xl font-semibold tracking-tight text-muted-foreground">
        {de.home.heading}
      </h1>
      <p className="max-w-prose text-muted-foreground">{de.home.welcome}</p>
      <p data-testid="today-date" className="text-xl">
        {de.home.today(germanLongDate(date))}
      </p>
      {view === null ? <NotConfigured /> : <DistributionPanel view={view} />}
    </main>
  );
}
