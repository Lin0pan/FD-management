/**
 * The digital customer card.
 *
 * This is what staff read across the desk while they transcribe a card by hand or type it into the
 * printing system FD already owns — so it is laid out card-shaped and large, and deliberately
 * produces no PDF and carries no print stylesheet
 * (tasks/prd-us-02-issue-customer-card.md §US-02.4).
 *
 * Nothing on it is computed here: `readCard` derives the number, the counts and the history it
 * replaced, and this file only arranges them.
 */

import Link from "next/link";
import { readCard, type CardView } from "@/application/customers/read-card";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { customerDeps } from "../../deps";
import { ReissueControls } from "../reissue-controls";

/** The counts are derived per request, so a cached card could show numbers a birthday has passed. */
export const dynamic = "force-dynamic";

/** The group's colour, so the card is recognisable at a glance the way the physical one is. */
const GROUP_STYLES = {
  RED: "bg-red-600 text-white",
  BLUE: "bg-blue-700 text-white",
} as const;

function NotFound(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.customers.cardView.heading}</h1>
      <p className="max-w-prose">{de.customers.errors.notFound}</p>
    </main>
  );
}

/** One big number with its label — the counts have to be legible from across a desk. */
function Count({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <span data-testid={testId} className="text-4xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Card({ view }: { view: CardView }): React.ReactElement {
  return (
    <section
      data-testid="customer-card"
      className="flex flex-col gap-6 rounded-xl border-2 border-foreground/20 p-8 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.customers.fields.cardNumber}</span>
          <span data-testid="card-number" className="text-5xl font-bold tabular-nums">
            {view.cardNumber}
          </span>
        </div>
        <span
          data-testid="card-group"
          className={`rounded-full px-4 py-2 text-lg font-semibold ${GROUP_STYLES[view.group]}`}
        >
          {de.customers.groups[view.group]}
        </span>
      </header>

      <p data-testid="card-name" className="text-3xl">
        {view.firstName} {view.lastName}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Count
          label={de.customers.derived.grownUps}
          value={view.composition.grownUps}
          testId="grown-ups"
        />
        <Count
          label={de.customers.derived.children}
          value={view.composition.children}
          testId="children"
        />
        <Count
          label={de.customers.derived.portions}
          value={view.allowance.portions}
          testId="portions"
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.customers.derived.price}</span>
          <span data-testid="price" className="text-4xl font-semibold tabular-nums">
            {formatEuros(view.allowance.priceCents)}
          </span>
        </div>
      </div>

      <p className="text-xs text-foreground/70">{de.customers.derived.standardValues}</p>

      <dl className="grid gap-2 text-sm text-foreground/70 sm:grid-cols-2">
        <div>
          <dt className="inline">{de.customers.cardView.issuedAt}: </dt>
          <dd className="inline font-medium">{germanDate(view.card.issuedAt)}</dd>
        </div>
        <div>
          <dt className="inline">{de.customers.cardView.issuedBecause}: </dt>
          <dd className="inline font-medium">{de.customers.cardReasons[view.card.reason]}</dd>
        </div>
      </dl>
    </section>
  );
}

function Superseded({ view }: { view: CardView }): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{de.customers.cardView.supersededHeading}</h2>
      {view.superseded.length === 0 ? (
        <p className="text-foreground/80">{de.customers.cardView.supersededNone}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {view.superseded.map((entry) => (
            <li key={entry.number} data-testid="superseded-card" className="text-foreground/80">
              {de.customers.cardView.supersededEntry(
                entry.number,
                germanDate(entry.card.issuedAt),
                de.customers.cardReasons[entry.card.reason],
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * How many cards this household has been through, and how many of those replaced a lost one.
 *
 * The two are shown side by side because they answer different questions — a card replaced because a
 * birthday overtook the printed counts (US-13) is not a loss, and reading them as one number would
 * count the software's own reissue against the household. Both are stated and nothing more: there is
 * no threshold here, no colour that changes and no sentence that appears at a high count, because
 * whether a number means anything is FD's judgement (§FR-4, §FR-5).
 */
function Issued({ view }: { view: CardView }): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{de.customers.cardView.issuedHeading}</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <Count
          label={de.customers.cardView.issuedCount}
          value={view.cardsIssued}
          testId="cards-issued"
        />
        <Count
          label={de.customers.cardView.lossCount}
          value={view.reissuesForLoss}
          testId="reissues-for-loss"
        />
      </div>
      <p className="max-w-prose text-xs text-foreground/60">{de.customers.cardView.issuedHint}</p>
    </section>
  );
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // A URL is typed by hand as easily as it is clicked, so a non-numeric id is the same answer as an
  // id nobody holds: there is no such customer.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return <NotFound />;
  }

  // Only the read is guarded: a `try` around the JSX would catch nothing anyway, because React
  // renders the component after this function has already returned.
  let view: CardView;
  try {
    view = await readCard(customerDeps, numericId);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "CustomerNotFound") {
      return <NotFound />;
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-3xl font-semibold">{de.customers.cardView.heading}</h1>
      <Card view={view} />
      <p className="max-w-prose text-foreground/80">{de.customers.cardView.current}</p>
      <Superseded view={view} />
      <p className="text-xs text-foreground/60">{de.customers.cardView.countsHint}</p>

      <Issued view={view} />

      {/* An archived household holds no slot, so `reissueCard` refuses them a card — offering the
          button would only be a way of finding that out. */}
      {view.status === "ARCHIVED" ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{de.customers.reissue.heading}</h2>
          <ReissueControls
            customerId={view.customerId}
            cardNumber={view.cardNumber}
            nextCardNumber={view.nextCardNumber}
          />
        </section>
      )}

      {/* The same control as the other two ways to a record, and for the same reason: it navigates
          and writes nothing, so it carries no border. It was the last hand-styled link in the app —
          an underline of its own, agreeing with nothing.

          `self-start` is not decoration. `main` is a flex column, whose `align-items: stretch` would
          otherwise pull an `inline-flex` Button across the full width of the page. */}
      <Button variant="ghost" asChild className="self-start">
        <Link href={`/kunden/${view.customerId}`}>{de.customers.cardView.backToCustomer}</Link>
      </Button>
    </main>
  );
}
