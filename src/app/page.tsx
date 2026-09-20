/**
 * The Start dashboard (`tasks/prd-us-17-navigation-shell.md` §US-17.3) — the greeting, the date and
 * the Ausgabe, and nothing else to work through: the nav bar carries the links and the signals live
 * on the hub (US-17.2). It has something to click in exactly two states — nothing configured yet,
 * and an afternoon under way, which it states in a panel because that is then the one thing the
 * screen has to say (US-34.9).
 *
 * **The date only, no clock time**, which is what keeps this a plain server component: no client
 * boundary, no ticking state, and a page that renders the same under the fixed clock the e2e suite
 * pins. `now` comes from the injected `Clock`.
 */

import Link from "next/link";
import { readDistributionSessionState } from "@/application/distribution/read-distribution-session-state";
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
          {/* Second only to the greeting, and a step above the date lines below: on a screen of
              three sentences the running afternoon is the one that needs acting on. It carries no
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
  // The afternoon is read even on a day nothing is configured: the two answers are independent, and
  // a session may be running whatever the settings history holds.
  const [configured, session] = await Promise.all([
    isConfigured(),
    readDistributionSessionState(distributionDeps),
  ]);
  const date = distributionDeps.clock.now();

  return (
    <main className={SHELL}>
      {/* The greeting is the `h1` — one line, and the whole of the welcome. It is set full strength
          rather than muted now that it is the only thing at the top of the screen. */}
      <h1 className="text-3xl font-semibold tracking-tight">{de.home.heading}</h1>
      {/* Above the date and the coming Ausgabe, because an afternoon that is running outranks both:
          they describe the calendar, and this is what is actually happening. */}
      {session.running === null ? null : <RunningSessionPanel session={session.running.session} />}
      <p data-testid="today-date" className="text-xl text-muted-foreground">
        {de.home.today(germanLongDate(date))}
      </p>
      {configured ? null : <NotConfigured />}
    </main>
  );
}
