/**
 * The cards-due-for-reissue screen (tasks/prd-us-13-age-13-reclassification.md §US-13.4).
 *
 * Nothing on it is worked out here. `listCardsDueForReissue` compares what each card was printed with
 * against what the household is today and says why they differ; this page lays the pairs out side by
 * side so staff can see at a glance what changed.
 *
 * The tone is the point of the screen. Everything here can wait, and a card that has fallen behind is
 * never grounds to turn anyone away (FR-5) — so the sentence saying so stands above the list rather
 * than below it, there is no count of "overdue" anything, nothing is coloured as a warning, and no
 * row asks to be dealt with before the next one.
 */

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  listCardsDueForReissue,
  type CardDueForReissue,
} from "@/application/customers/cards-due-for-reissue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { customerDeps } from "../kunden/deps";
import { StaleCardControls } from "./stale-card-controls";

/**
 * The list changes at midnight without anything being written — a birthday is a read-time derivation
 * (PRD §5) — so a cached render would be a screen that quietly stopped being true.
 */
export const dynamic = "force-dynamic";

/** The page frame, the same one `/ausgabe` and `/kunden` use, so all three line up under the bar. */
const SHELL = "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 md:p-8";

/**
 * One of the two count sets, shaped so that the pair can actually be compared.
 *
 * The point is the alignment, not the box. Both tiles are laid out identically and given a floor
 * wide enough for the longest German counts string, so the two values sit on the same baseline at
 * the same offset inside their tile; `whitespace-nowrap` keeps each on one line whatever the label
 * above it is called. Before this, "Erwachsene: 2" and "Erwachsene: 3" — the pair a reader has to
 * diff — landed on different lines of different boxes, 24px apart vertically and 372px apart
 * horizontally, and the screen stopped doing the one thing it exists for.
 *
 * The label and the value stay inside one `<p>`: split into two stacked nodes they are announced as
 * two unrelated facts, with only the layout joining them.
 */
function Counts({
  label,
  counts,
  testId,
}: {
  label: string;
  counts: { grownUps: number; children: number };
  testId: string;
}): React.ReactElement {
  return (
    <p className="flex min-w-56 flex-col gap-0.5 rounded-lg bg-muted/50 px-4 py-3">
      <span className="text-xs leading-snug text-muted-foreground">{label}</span>
      <span data-testid={testId} className="text-base font-semibold whitespace-nowrap tabular-nums">
        {de.customers.derived.countsValue(counts.grownUps, counts.children)}
      </span>
    </p>
  );
}

function Row({ due }: { due: CardDueForReissue }): React.ReactElement {
  return (
    <li
      data-testid="cards-due-row"
      data-customer-number={due.customerNumber}
      className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">
          {due.firstName} {due.lastName}
        </h3>
        {/* The reason is not a third data point beside the two count sets — it is their summary, and
            it is what the eye scans a row for. Neutral grey: a to-do list, not an alert queue. */}
        <Badge variant="secondary">
          <span data-testid="cards-due-reason">{de.cardsDue.reasons[due.reason]}</span>
        </Badge>
        <p className="text-sm text-muted-foreground">
          <span>{de.customers.fields.customerNumber}: </span>
          <span data-testid="cards-due-customer-number" className="tabular-nums">
            {due.customerNumber}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          <span>{de.customers.fields.cardNumber}: </span>
          <span data-testid="cards-due-card-number" className="tabular-nums">
            {due.cardNumber}
          </span>
        </p>
      </div>

      {/* Both count sets beside each other, in that order: what the piece of card says, then what
          the household is. Neither tile is tinted — neither side is the good one. */}
      <div className="flex flex-wrap items-center gap-3">
        <Counts
          label={de.cardsDue.countsOnCard}
          counts={due.countsOnCard}
          testId="cards-due-counts-on-card"
        />
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <Counts
          label={de.cardsDue.countsToday}
          counts={due.countsToday}
          testId="cards-due-counts-today"
        />
      </div>

      {/* Write first, then the way to the record — and both on one line, so the row stops ending on
          a stranded underline below a full-width bar. */}
      <div className="flex flex-wrap items-start gap-2">
        <StaleCardControls
          customerId={due.customerId}
          cardNumber={due.cardNumber}
          nextCardNumber={due.nextCardNumber}
        />
        <Button variant="ghost" asChild>
          <Link href={`/kunden/${due.customerId}`} data-testid="cards-due-customer-link">
            {de.cardsDue.customerLink}
          </Link>
        </Button>
      </div>
    </li>
  );
}

export default async function CardsDuePage(): Promise<React.ReactElement> {
  const due = await listCardsDueForReissue(customerDeps);

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.cardsDue.heading}</h1>
      </div>

      {/* Above the list, not beneath it: whoever opens this screen has to read that nothing here is
          urgent before they read the first row, not after they have worked through it. A `status`
          region and not an `alert`, and no icon — on a screen whose whole point is that nothing here
          is urgent, being announced as an alert would say the opposite of the words. */}
      <Alert role="status">
        <AlertDescription data-testid="cards-due-not-urgent" className="max-w-prose">
          {de.cardsDue.notUrgent}
        </AlertDescription>
      </Alert>

      {/* One card with divided rows, not a card per household: two nested rounded boxes read as a
          pile of panels, and this is a list. */}
      <Card>
        {/* A real <h2> inside the CardTitle — a Card is not a section and a CardTitle is not a
            heading, so without it the row names would be the only headings on the screen and would
            be announced with nothing above them saying what the collection is. */}
        <CardHeader className="border-b">
          <CardTitle className="text-lg">
            <h2>{de.cardsDue.listTitle}</h2>
          </CardTitle>
          <CardAction className="text-sm text-muted-foreground">
            {de.customerList.actions.cardsDueBadge(due.length)}
          </CardAction>
        </CardHeader>
        <CardContent>
          {due.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="cards-due-empty">{de.cardsDue.empty}</AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col">
              {due.map((entry) => (
                <Row key={entry.customerId} due={entry} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
