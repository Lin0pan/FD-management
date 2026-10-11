/**
 * The cards still to be printed (US-39.4) — built like `/karten-neuausstellung` (D12). A to-do list,
 * not an alert queue: a card not yet printed is valid at the counter (D11), so nothing is tinted.
 */

import Link from "next/link";
import {
  justPrintedCard,
  listCardsToPrint,
  type CardToPrint,
  type JustPrintedCard,
} from "@/application/customers/cards-to-print";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { customerDeps } from "../kunden/deps";
import { STATUS_CHROME, StateWord } from "../kunden/state-word";
import { Confirmation } from "../notice";
import { SHELL } from "../shell";
import { BackToOverviews } from "../uebersichten/back-link";
import { MarkPrintedControl, UndoPrintedControl } from "./print-controls";
import { PRINTED_CARD, PRINTED_CUSTOMER, wholeNumber } from "./print-state";

export const dynamic = "force-dynamic";

function Row({ card }: { card: CardToPrint }): React.ReactElement {
  return (
    <li
      data-testid="cards-to-print-row"
      data-customer-number={card.customerNumber}
      className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            data-testid="cards-to-print-card-number"
            className="text-lg font-semibold tabular-nums"
          >
            {card.cardNumber}
          </span>
          <Link
            href={`/kunden/${card.customerId}/karte`}
            data-testid="cards-to-print-name"
            className="text-lg break-words hover:underline focus-visible:underline"
          >
            {card.firstName} {card.lastName}
          </Link>
          {card.blocked ? (
            <StateWord
              word={de.customers.status.BLOCKED}
              testId="cards-to-print-blocked"
              chrome={STATUS_CHROME.BLOCKED}
            />
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <span>{de.cardsToPrint.issuedAt}: </span>
          <span data-testid="cards-to-print-issued-at" className="tabular-nums">
            {germanDate(card.issuedAt)}
          </span>
          <span aria-hidden="true"> · </span>
          <Badge variant="secondary">
            <span data-testid="cards-to-print-reason">{de.customers.cardReasons[card.reason]}</span>
          </Badge>
        </p>
      </div>
      <MarkPrintedControl
        customerId={card.customerId}
        index={card.index}
        cardNumber={card.cardNumber}
      />
    </li>
  );
}

/** A positive whole number off the address bar, or `null` — anything typed there is no offer. */
function paramNumber(value: string | string[] | undefined): number | null {
  const parsed = wholeNumber.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function undoOffer(params: {
  [PRINTED_CUSTOMER]?: string | string[];
  [PRINTED_CARD]?: string | string[];
}): Promise<JustPrintedCard | null> {
  const customerId = paramNumber(params[PRINTED_CUSTOMER]);
  const index = paramNumber(params[PRINTED_CARD]);
  return customerId === null || index === null
    ? null
    : justPrintedCard(customerDeps, { customerId, index });
}

export default async function CardsToPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    [PRINTED_CUSTOMER]?: string | string[];
    [PRINTED_CARD]?: string | string[];
  }>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const [cards, printed] = await Promise.all([listCardsToPrint(customerDeps), undoOffer(params)]);

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.cardsToPrint.heading}</h1>
        <BackToOverviews testId="cards-to-print-back" />
      </div>

      {/* Above the list: the row it was ticked from is gone by the time this renders. */}
      {printed === null ? null : (
        <Confirmation
          text={de.cardsToPrint.done(
            printed.cardNumber,
            `${printed.firstName} ${printed.lastName}`,
          )}
          testId="cards-to-print-done"
        >
          <UndoPrintedControl customerId={printed.customerId} index={printed.index} />
        </Confirmation>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">
            <h2>{de.cardsToPrint.listTitle}</h2>
          </CardTitle>
          <CardAction className="text-sm text-muted-foreground">
            {de.cardsToPrint.count(cards.length)}
          </CardAction>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="cards-to-print-empty">
                {de.cardsToPrint.empty}
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col">
              {cards.map((card) => (
                <Row key={card.customerId} card={card} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
