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

import Link from "next/link";
import {
  listCardsDueForReissue,
  type CardDueForReissue,
} from "@/application/customers/cards-due-for-reissue";
import { de } from "@/i18n/de";
import { customerDeps } from "../kunden/deps";
import { StaleCardControls } from "./stale-card-controls";

/**
 * The list changes at midnight without anything being written — a birthday is a read-time derivation
 * (PRD §5) — so a cached render would be a screen that quietly stopped being true.
 */
export const dynamic = "force-dynamic";

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
    <p className="rounded border border-foreground/15 px-3 py-2">
      <span className="text-sm text-foreground/70">{label}: </span>
      <span data-testid={testId} className="font-medium tabular-nums">
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
      className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold">
          {due.firstName} {due.lastName}
        </h2>
        <p className="text-foreground/70">
          <span className="text-sm">{de.customers.fields.customerNumber}: </span>
          <span data-testid="cards-due-customer-number" className="tabular-nums">
            {due.customerNumber}
          </span>
        </p>
        <p className="text-foreground/70">
          <span className="text-sm">{de.customers.fields.cardNumber}: </span>
          <span data-testid="cards-due-card-number" className="tabular-nums">
            {due.cardNumber}
          </span>
        </p>
      </div>

      {/* Both count sets beside each other, in that order: what the piece of card says, then what
          the household is. The reason is stated in words next to them and never as a colour. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Counts
          label={de.cardsDue.countsOnCard}
          counts={due.countsOnCard}
          testId="cards-due-counts-on-card"
        />
        <Counts
          label={de.cardsDue.countsToday}
          counts={due.countsToday}
          testId="cards-due-counts-today"
        />
        <p className="rounded border border-foreground/15 px-3 py-2">
          <span className="text-sm text-foreground/70">{de.cardsDue.reasonLabel}: </span>
          <span data-testid="cards-due-reason" className="font-medium">
            {de.cardsDue.reasons[due.reason]}
          </span>
        </p>
      </div>

      <StaleCardControls
        customerId={due.customerId}
        cardNumber={due.cardNumber}
        nextCardNumber={due.nextCardNumber}
      />

      <Link
        href={`/kunden/${due.customerId}`}
        className="self-start underline underline-offset-4"
        data-testid="cards-due-customer-link"
      >
        {de.cardsDue.customerLink}
      </Link>
    </li>
  );
}

export default async function CardsDuePage(): Promise<React.ReactElement> {
  const due = await listCardsDueForReissue(customerDeps);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.cardsDue.heading}</h1>
      <p className="max-w-prose text-foreground/80">{de.cardsDue.intro}</p>
      {/* Above the list, not beneath it: whoever opens this screen has to read that nothing here is
          urgent before they read the first row, not after they have worked through it. */}
      <p data-testid="cards-due-not-urgent" className="max-w-prose text-foreground/80">
        {de.cardsDue.notUrgent}
      </p>

      {due.length === 0 ? (
        <p data-testid="cards-due-empty" className="max-w-prose">
          {de.cardsDue.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {due.map((entry) => (
            <Row key={entry.customerId} due={entry} />
          ))}
        </ul>
      )}

      <Link href="/" className="underline underline-offset-4">
        {de.cardsDue.backToHome}
      </Link>
    </main>
  );
}
