/**
 * The Start dashboard (`tasks/prd-us-17-navigation-shell.md` §US-17.3) — the greeting and the date,
 * plus whatever is pushed at DF: an afternoon under way (US-34.9), what is waiting to be done
 * (US-38.4) and, before anything is configured, the way to the settings. Lists DF look things up in
 * are pulled from Übersichten, not shown here. It names no coming Ausgabe: nothing in the software
 * knows when the next one is (ADR-020).
 *
 * **The date only, no clock time**, which is what keeps this a plain server component: no client
 * boundary, no ticking state, and a page that renders the same under the fixed clock the e2e suite
 * pins. `now` comes from the injected `Clock`.
 */

import Link from "next/link";
import { readDistributionSessionState } from "@/application/distribution/read-distribution-session-state";
import { listToDos, type ToDo, type ToDoKind } from "@/application/overviews/list-to-dos";
import type { Overviews } from "@/application/overviews/read-overviews";
import { readCurrentSettings } from "@/application/settings/read-current-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DistributionSession } from "@/domain/distribution/session";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanDateTime, germanLongDate } from "@/i18n/format";
import { distributionDeps } from "./ausgabe/deps";
import { SessionGroupBadges } from "./ausgabe/session-group-badges";
import { SHELL } from "./shell";
import { overviewDeps } from "./uebersichten/deps";
import { ListLink } from "./uebersichten/list-link";

/**
 * The date turns over at midnight without anything being written, and a session is started and
 * ended on another workstation — so this screen is never cached.
 */
export const dynamic = "force-dynamic";

/**
 * The afternoon under way, on the first screen anybody opens (US-34.9, PRD A-7). Nothing ends a
 * session but a staff member, so one forgotten on Thursday evening goes on refusing every
 * household's next hand-out until somebody notices — and this is where they notice it.
 *
 * It states the instant the session began rather than how long it has run: a duration would be a
 * ticking value, and the whole screen is built to have none.
 */
function RunningSessionPanel({ session }: { session: DistributionSession }): React.ReactElement {
  const words = de.distribution.session.onStartScreen;

  return (
    <Card data-testid="running-session">
      <CardContent className="flex flex-col items-start gap-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Second only to the greeting, and a step above the date below it: on a screen of two
              sentences the running afternoon is the one that needs acting on. It carries no
              tint of its own — the group badges inside it do, and a translucent fill behind them
              would composite into a third colour meaning neither (`ui_styling_guide.md` §5). */}
          <p className="text-2xl font-semibold tracking-tight">{de.distribution.session.running}</p>
          <SessionGroupBadges groups={session.groups} testId="running-session-groups" />
        </div>
        <p data-testid="running-session-started" className="text-base">
          {words.startedAt(germanDateTime(session.startedAt))}
        </p>
        {/* Ending it is the act this panel exists to prompt, and it belongs to the counter — so the
            way there looks like the action it leads to, as the unconfigured card's link does. */}
        <Button size="lg" asChild>
          <Link href="/ausgabe">{words.link}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Which list each to-do opens: the one its Übersichten tile opens (US-38.4). A `Record`, so a new
 * `ToDoKind` fails the build until it has a place to link to.
 */
const TO_DO_LISTS: Record<ToDoKind, { readonly list: keyof Overviews; readonly testId: string }> = {
  CARDS_DUE: { list: "cardsDue", testId: "to-do-cards-due" },
};

/**
 * „Zu erledigen" — rendered only when `listToDos` returned something, so no empty state. Neutral
 * on purpose: nothing here is overdue, and the notice tiers are for what is (`ui_styling_guide.md`
 * §5).
 */
function ToDos({ toDos }: { toDos: ReadonlyArray<ToDo> }): React.ReactElement {
  return (
    <section data-testid="to-dos" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{de.home.toDos}</h2>
      <ul className="flex flex-col gap-2">
        {toDos.map((toDo) => {
          const { list, testId } = TO_DO_LISTS[toDo.kind];
          return (
            <li key={toDo.kind}>
              <ListLink
                list={list}
                count={toDo.count}
                linkTestId={testId}
                valueTestId={`${testId}-count`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Before DF has configured anything (FR-10) — the one state in which this screen has something to
 * do, so it gets a `Card`. Neutral deliberately: there is no group to name, so painting it would be
 * the only false statement the screen could make.
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
 * Whether DF has configured anything yet — caught rather than thrown: an error page on the first
 * screen after an install says the software is broken when in fact it is empty.
 */
async function isConfigured(): Promise<boolean> {
  try {
    await readCurrentSettings(distributionDeps);
    return true;
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return false;
    }
    throw error;
  }
}

export default async function Home(): Promise<React.ReactElement> {
  // The afternoon is read even when nothing is configured: the two answers are independent, and a
  // session may be running whatever the settings history holds.
  const [configured, session, toDos] = await Promise.all([
    isConfigured(),
    readDistributionSessionState(distributionDeps),
    listToDos(overviewDeps),
  ]);
  const date = distributionDeps.clock.now();

  return (
    <main className={SHELL}>
      {/* The greeting is the `h1` — one line, and the whole of the welcome. It is set full strength
          rather than muted now that it is the only thing at the top of the screen. */}
      <h1 className="text-3xl font-semibold tracking-tight">{de.home.heading}</h1>
      {/* Above the date, because an afternoon that is running outranks it: the date describes the
          calendar, and this is what is actually happening. */}
      {session.running === null ? null : <RunningSessionPanel session={session.running.session} />}
      {/* Below the running afternoon, which blocks every household; above the date, which blocks
          nothing. */}
      {toDos.length === 0 ? null : <ToDos toDos={toDos} />}
      <p data-testid="today-date" className="text-xl text-muted-foreground">
        {de.home.today(germanLongDate(date))}
      </p>
      {configured ? null : <NotConfigured />}
    </main>
  );
}
