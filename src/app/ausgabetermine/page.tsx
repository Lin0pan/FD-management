/**
 * The afternoons DF has held, newest first (US-37.3) — the first screen in the application that is
 * not about today, and the way into everything US-34 and US-35 have been writing down.
 *
 * A read and nothing else: `listDistributionSessions` answers, this page lays the rows out. The
 * running afternoon is in the list like any other, at the top, marked and with its figures still
 * moving — what to print for an afternoon that has no end yet is this screen's decision and the use
 * case deliberately leaves it open.
 *
 * The route is `/ausgabetermine` and deliberately not `/ausgaben`, which is one letter from the
 * counter screen `/ausgabe` and would be misread in the address bar and in every future
 * conversation about the code.
 */

import Link from "next/link";
import {
  listDistributionSessions,
  type ListedSession,
} from "@/application/distribution/list-distribution-sessions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDayOf } from "@/i18n/format";
import { SessionGroupBadges } from "../ausgabe/session-group-badges";
import { pastSessionDeps } from "./deps";
import { SHELL } from "../shell";

/** An afternoon is started and ended on another workstation too, so never cache this screen. */
export const dynamic = "force-dynamic";

function SessionRow({ session }: { session: ListedSession }): React.ReactElement {
  const words = de.distribution.pastSessions;

  return (
    <TableRow
      data-testid="past-session-row"
      data-session-id={session.id}
      data-running={session.running ? "true" : "false"}
    >
      {/* The day, not the two instants: this is a column looked up, and the afternoon's own screen
          is where it is read as a moment. The whole cell is the way in — the date is what DF are
          looking for, so it is what they click. */}
      <TableCell className="whitespace-nowrap">
        <Link
          href={`/ausgabetermine/${session.id}`}
          data-testid="past-session-link"
          className="font-medium tabular-nums underline-offset-4 hover:underline"
        >
          {germanDayOf(session.startedAt)}
        </Link>
        {/* Grey, not an alarm: an afternoon under way is the ordinary state of the top row on a
            Thursday. The word carries the meaning and the badge only makes it findable (§5). */}
        {session.running ? (
          <Badge variant="secondary" data-testid="past-session-running" className="ml-2">
            {words.running}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        <SessionGroupBadges groups={session.groups} testId="past-session-groups" />
      </TableCell>
      <TableCell data-testid="past-session-households" className="text-right tabular-nums">
        {session.households}
      </TableCell>
      {/* „vorläufig“ stands once, under the sum, rather than on each of the two figures: the
          households and the sum are one pair — what the afternoon has taken so far — and the word
          repeated twice on one row is noise, not a second fact.

          *Under* it and not beside it, because this is a money column read by scanning down its
          right edge: a word on the same line pushes the one figure that is still moving out of
          line with the eight below it. */}
      <TableCell className="text-right tabular-nums">
        <span data-testid="past-session-total">{formatEuros(session.totalPaidCents)}</span>
        {session.running ? (
          <span
            data-testid="past-session-provisional"
            className="block text-xs text-muted-foreground"
          >
            {words.provisional}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export default async function PastSessionsPage(): Promise<React.ReactElement> {
  const sessions = await listDistributionSessions(pastSessionDeps);
  const words = de.distribution.pastSessions;

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{words.heading}</h1>
      </div>

      {/* No card title: the `h1` above names the one thing on this screen, and a second heading
          repeating it would only be there to fill the slot the other screens' cards have. */}
      <Card>
        <CardContent>
          {sessions.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="past-sessions-empty">{words.empty}</AlertDescription>
            </Alert>
          ) : (
            <Table data-testid="past-sessions-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{words.table.date}</TableHead>
                  <TableHead>{words.table.groups}</TableHead>
                  <TableHead className="text-right">{words.table.households}</TableHead>
                  <TableHead className="text-right">{words.table.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
