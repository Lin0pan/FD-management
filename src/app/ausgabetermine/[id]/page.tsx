/**
 * One afternoon and the households that collected at it (US-37.4) — where a question about last
 * Thursday is answered from the screen rather than from memory.
 *
 * Nothing is decided here. `readDistributionSession` has already chosen between the receipts taken
 * when the afternoon closed and the register as it stands today (US-37.2, E-5); this page lays the
 * rows out and never asks that question a second time — asked twice, the screen would show a frozen
 * name in one column beside a live one in the next.
 *
 * Read-only by construction: a past afternoon cannot be edited, and a running one is corrected at
 * the counter where it is being served.
 */

import Link from "next/link";
import {
  readDistributionSession,
  type CollectedHousehold,
  type DistributionSessionDetail,
} from "@/application/distribution/read-distribution-session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate, germanDateTime, germanDayOf } from "@/i18n/format";
import { GROUP_STYLES } from "../../accents";
import { SessionGroupBadges } from "../../ausgabe/session-group-badges";
import { SHELL } from "../../shell";
import { pastSessionDeps } from "../deps";

/** An afternoon is served and ended on another workstation too, so never cache this screen. */
export const dynamic = "force-dynamic";

function NotFound(): React.ReactElement {
  return (
    <main className={SHELL}>
      <h1 className="text-3xl font-semibold tracking-tight">
        {de.distribution.pastSessions.heading}
      </h1>
      <p data-testid="session-detail-not-found" className="max-w-prose">
        {de.distribution.pastSessions.detail.notFound}
      </p>
    </main>
  );
}

/**
 * One household that collected. Every column is the Kundenliste's — the same headings, the same
 * shapes, the same badge — because this is the same register read on a different day.
 */
function HouseholdRow({ row }: { row: CollectedHousehold }): React.ReactElement {
  return (
    <TableRow data-testid="session-household-row" data-customer-id={row.customerId}>
      <TableCell data-testid="session-household-number" className="text-right tabular-nums">
        {row.customerNumber}
      </TableCell>
      {/* Linked by the id the afternoon names the household under, never by the number on the row:
          a slot given to somebody else since would otherwise lead to the wrong record (ADR-016).
          The name is the one this row carries — last week's, on a frozen row — and the record it
          opens is today's, which is the whole reason the two are worth being able to compare. */}
      <TableCell className="min-w-64">
        <Link
          href={`/kunden/${row.customerId}`}
          data-testid="session-household-name"
          title={`${row.lastName}, ${row.firstName}`}
          className="block max-w-64 truncate font-medium underline-offset-4 hover:underline"
        >
          {row.lastName}, {row.firstName}
        </Link>
      </TableCell>
      <TableCell data-testid="session-household-card" className="tabular-nums">
        {row.cardNumber}
      </TableCell>
      <TableCell>
        <Badge
          data-testid="session-household-group"
          variant="outline"
          className={GROUP_STYLES[row.group]}
        >
          {de.customers.groups[row.group]}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span data-testid="session-household-grown-ups">{row.grownUps}</span>
        {" + "}
        <span data-testid="session-household-children">{row.children}</span>
      </TableCell>
      <TableCell data-testid="session-household-price" className="text-right tabular-nums">
        {formatEuros(row.priceCents)}
      </TableCell>
      {/* The date alone, without the Kundenliste's „gültig“/„abgelaufen“ beside it: where a
          certificate stands is a fact about today, and this table is about an afternoon. */}
      <TableCell data-testid="session-household-certificate" className="tabular-nums">
        {germanDate(row.certificateValidUntil)}
      </TableCell>
      <TableCell
        data-testid="session-household-reminders"
        className={`text-right tabular-nums ${row.reminderCount === 0 ? "text-muted-foreground" : ""}`}
      >
        {row.reminderCount === 0 ? de.customerList.table.noReminders : row.reminderCount}
      </TableCell>
      <TableCell data-testid="session-household-paid" className="text-right tabular-nums">
        {formatEuros(row.paidCents)}
      </TableCell>
    </TableRow>
  );
}

/**
 * The afternoon's register. Nine columns, the Kundenliste's own count, so it carries the
 * Kundenliste's answer to them: the table scrolls inside its own container until the content box is
 * wide enough to hold them all (`docs/guideline/ui_styling_guide.md` §3), and the page never
 * scrolls sideways.
 *
 * No sticky header, unlike the Kundenliste: that list is the whole register, this one is a single
 * afternoon and fits on a screen.
 */
function HouseholdTable({
  households,
}: {
  households: ReadonlyArray<CollectedHousehold>;
}): React.ReactElement {
  const columns = de.customerList.table;
  return (
    <Table data-testid="session-households-table" containerClassName="overflow-x-auto">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-right">{columns.customerNumber}</TableHead>
          <TableHead>{columns.name}</TableHead>
          <TableHead>{columns.cardNumber}</TableHead>
          <TableHead>{columns.group}</TableHead>
          <TableHead className="text-right">{columns.household}</TableHead>
          <TableHead className="text-right">{columns.price}</TableHead>
          <TableHead>{columns.certificate}</TableHead>
          <TableHead className="text-right">{columns.reminders}</TableHead>
          {/* „Betrag“ is the counter's own word for what was handed over (US-29.7), and this column
              is that figure — so it is read from the counter's key rather than worded again. */}
          <TableHead className="text-right">{de.distribution.serve.amount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {households.map((row) => (
          <HouseholdRow key={row.customerId} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * What the afternoon was: whom it served, when it ran, and what it came to. Both instants are
 * written out in full rather than as one day with two times — an afternoon ended the next morning
 * is exactly the case this is read in, and „14:00–08:30“ would state it as a morning.
 */
function SessionHeader({ detail }: { detail: DistributionSessionDetail }): React.ReactElement {
  const words = de.distribution.pastSessions.detail;
  const { session, summary } = detail;

  return (
    <Card data-testid="session-detail-header">
      <CardContent className="flex flex-col gap-4">
        <SessionGroupBadges groups={session.groups} testId="session-detail-groups" />
        <div className="flex flex-col gap-1">
          <p data-testid="session-detail-started">
            {words.startedAt(germanDateTime(session.startedAt))}
          </p>
          {session.endedAt === null ? null : (
            <p data-testid="session-detail-ended">
              {words.endedAt(germanDateTime(session.endedAt))}
            </p>
          )}
          <p data-testid="session-detail-summary">
            {words.summary(summary.households, summary.totalPaidCents)}
          </p>
          {/* The overview's word, on the overview's terms: the figures of an afternoon still under
              way are what it has taken so far. Nothing beside it explains that they may still
              change — that is what the word says. */}
          {detail.running ? (
            <p data-testid="session-detail-provisional" className="text-sm text-muted-foreground">
              {de.distribution.pastSessions.provisional}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PastSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // A URL is typed as easily as clicked, so a non-numeric id gets the same answer as one no
  // afternoon carries: there is no such Ausgabetermin.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return <NotFound />;
  }

  // Only the read is guarded: React renders the component after this function returns.
  let detail: DistributionSessionDetail;
  try {
    detail = await readDistributionSession(pastSessionDeps, numericId);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "DistributionSessionNotFound") {
      return <NotFound />;
    }
    throw error;
  }

  const words = de.distribution.pastSessions.detail;

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {words.heading(germanDayOf(detail.session.startedAt))}
        </h1>
        {/* The overview's badge, so an afternoon under way is recognised by the same mark on both
            screens (`ui_styling_guide.md` §5). */}
        {detail.running ? (
          <Badge variant="secondary" data-testid="session-detail-running">
            {de.distribution.pastSessions.running}
          </Badge>
        ) : null}
      </div>

      <SessionHeader detail={detail} />

      {/* The one hint this screen carries, and only where it says something the table cannot: an
          afternoon ended before the capture existed (US-35) has no receipts, so its rows are
          today's record rather than that afternoon's. */}
      {detail.running || detail.frozen ? null : (
        <Alert role="status">
          <AlertDescription data-testid="session-detail-live">{words.live}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          {detail.households.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="session-detail-empty">{words.empty}</AlertDescription>
            </Alert>
          ) : (
            <HouseholdTable households={detail.households} />
          )}
        </CardContent>
      </Card>

      <Button variant="ghost" asChild className="self-start">
        <Link href="/ausgabetermine" data-testid="session-detail-back">
          {de.distribution.pastSessions.link}
        </Link>
      </Button>
    </main>
  );
}
