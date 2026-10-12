/**
 * Who the afternoon serves and who has collected (US-23, US-41.8): the tally, and below the counter
 * every household of the session's group(s) in the Kundenliste's own columns plus „Heute".
 *
 * Nothing here is a second place to serve someone — a name navigates, exactly as typing the number
 * does (§FR-7). No row tint: the group badge in each row carries the colour, and chrome marks only the
 * exception, so the unserved carry nothing in „Heute" (`ui_styling_guide.md` §5).
 */

import { Check } from "lucide-react";
import type { CounterRosterView } from "@/application/distribution/read-counter-roster";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { de } from "@/i18n/de";
import { CONFIRMATION_ACCENT } from "../accents";
import { CustomerCells, CustomerHeads } from "../kunden/customer-cells";

/**
 * One fraction per group the session serves (US-34.6) — a merged afternoon states both, because the
 * sum of the two cannot show which half is falling behind. Silent for a session serving nobody: the
 * list below says so, and the sentence is not said twice.
 */
export function SessionTally({ roster }: { roster: CounterRosterView }): React.ReactElement | null {
  if (roster.isEmpty) {
    return null;
  }
  const words = de.distribution.progress;
  return (
    <p data-testid="group-progress" className="text-base font-medium">
      {words.summaries(
        roster.tallies.map((tally) =>
          words.summary(
            de.distribution.group(de.distribution.colours[tally.group]),
            tally.progress.served,
            tally.progress.expected,
          ),
        ),
      )}
    </p>
  );
}

export function SessionHouseholds({ roster }: { roster: CounterRosterView }): React.ReactElement {
  const words = de.distribution.progress;
  const colours = roster.groups.map((group) => de.distribution.colours[group]);
  return (
    <Card data-testid="session-households">
      <CardHeader>
        <CardTitle className="flex items-baseline gap-3 text-lg">
          <h2>{words.heading(colours)}</h2>
          <span
            data-testid="session-households-count"
            className="text-sm font-normal text-muted-foreground"
          >
            {words.count(roster.rows.length)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {roster.isEmpty ? (
          <p data-testid="session-households-empty">
            {words.empty(de.distribution.groups(colours))}
          </p>
        ) : (
          <Table data-testid="session-households-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <CustomerHeads />
                <TableHead>{words.today}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.rows.map((row) => (
                <TableRow
                  key={row.customerId}
                  data-testid="session-household"
                  data-customer-number={row.customerNumber}
                >
                  <CustomerCells
                    row={row}
                    link={{
                      href: `/ausgabe?nummer=${row.customerNumber}`,
                      testId: `group-member-${row.customerNumber}`,
                    }}
                  />
                  <TableCell>
                    {row.servedInSession ? (
                      <Badge variant="outline" className={CONFIRMATION_ACCENT}>
                        <Check aria-hidden="true" />
                        <span data-testid={`served-${row.customerNumber}`}>{words.served}</span>
                      </Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
