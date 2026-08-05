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
import { formatCardNumber, parseCardNumber } from "@/domain/card/cardNumber";
import type { Group } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { GROUP_STYLES } from "../accents";
import { ISSUED_CARD } from "./issued-card";
import { customerDeps } from "../kunden/deps";
import { Confirmation } from "../notice";
import { StaleCardControls } from "./stale-card-controls";
import { SHELL } from "../shell";
import { Stat } from "../stat";

/**
 * The list changes at midnight without anything being written — a birthday is a read-time derivation
 * (PRD §5) — so a cached render would be a screen that quietly stopped being true.
 */
export const dynamic = "force-dynamic";

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
 * two unrelated facts, with only the layout joining them. That much is `Stat`'s, shared with the
 * counter and the customer screens; what this screen adds is the width floor, the one-line value and
 * the group hanging off the tile — the three things the comparison needs and a single figure does
 * not.
 */
function Counts({
  label,
  counts,
  testId,
  group,
}: {
  label: string;
  counts: { grownUps: number; children: number };
  testId: string;
  /** The group on this side of the comparison, when the group is what changed — otherwise `null`. */
  group: { value: Group; testId: string } | null;
}): React.ReactElement {
  return (
    <Stat
      label={label}
      value={de.customers.derived.countsValue(counts.grownUps, counts.children)}
      testId={testId}
      className="min-w-56 gap-0.5"
      valueClassName="text-base whitespace-nowrap"
    >
      {group === null ? null : (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{de.customers.fields.group}:</span>
          {/* The one colour on this screen, and the only place it is allowed: RED and BLUE *are*
              the printed card, which is what this screen is about being wrong. The word is inside
              the tint and never replaced by it. */}
          <Badge variant="outline" className={GROUP_STYLES[group.value]}>
            <span data-testid={group.testId}>{de.customers.groups[group.value]}</span>
          </Badge>
        </span>
      )}
    </Stat>
  );
}

function Row({ due }: { due: CardDueForReissue }): React.ReactElement {
  /**
   * On a group move the two count sets agree, so without this the row's most prominent device shows
   * two identical values and the fact that actually changed — the colour the card was printed —
   * appears nowhere. It is not shown on the other two reasons: a mark every row wears is texture
   * rather than emphasis, and the record answers "which group are they in" in one click.
   */
  const groupChanged = due.reason === "GROUP_CHANGE";

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
          group={
            groupChanged ? { value: due.groupOnCard, testId: "cards-due-group-on-card" } : null
          }
        />
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <Counts
          label={de.cardsDue.countsToday}
          counts={due.countsToday}
          testId="cards-due-counts-today"
          group={groupChanged ? { value: due.groupToday, testId: "cards-due-group-today" } : null}
        />
      </div>

      {/* Write on the left, the way to the record on the right, and deliberately not alike: one
          hands out a new card and cannot be taken back, the other only moves you. The border is
          what says which is which — a bordered control writes, a borderless one navigates — so the
          reissue keeps its outline and the link stays `ghost`, as the links on /kunden are.

          What they must not be is adjacent. Eight pixels apart, the borderless one stopped reading
          as a second thing you can do and started reading as a caption on the button beside it;
          `justify-between` puts them at opposite edges of the row, which is what actually fixes
          that. `items-start` keeps the link level with the closed summary rather than with the
          confirmation that unfolds beneath it. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
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

/**
 * The number a just-finished reissue handed over, or `null`.
 *
 * Parsed rather than printed as it arrived: what comes back is a string somebody could have typed
 * into the address bar, and a banner announcing a card that was never issued would be worse than no
 * banner at all. `parseCardNumber` is the same reader the counter uses, so what this screen accepts
 * as a card number and what that one does cannot drift apart.
 */
function issuedCard(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const { customerNumber, index } = parseCardNumber(value);
    return formatCardNumber(customerNumber, index);
  } catch {
    return null;
  }
}

export default async function CardsDuePage({
  searchParams,
}: {
  searchParams: Promise<{ [ISSUED_CARD]?: string | string[] }>;
}): Promise<React.ReactElement> {
  const [due, params] = await Promise.all([listCardsDueForReissue(customerDeps), searchParams]);
  const issued = issuedCard(params[ISSUED_CARD]);

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.cardsDue.heading}</h1>
      </div>

      {/* The row the reissue was started from is gone by the time this renders — it is the row's
          disappearance that a confirmation has to answer for. Above the list rather than where the
          row used to be: there is nothing to stand beside any more, and the redirect that brings it
          here lands at the top of the screen. */}
      {issued === null ? null : (
        <Confirmation text={de.customers.reissue.saved(issued)} testId="stale-reissue-saved" />
      )}

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
