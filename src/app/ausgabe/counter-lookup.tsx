/**
 * The counter lookup: the verdict as a chip beside the button, the household under it
 * (`tasks/prd-us-04-lookup-customer.md` §US-04.4, US-41).
 *
 * Nothing is decided here — this file chooses the words, the colour and the icon for a verdict
 * `evaluateAtCounter` has already reached. The switch is exhaustive by construction: the
 * `never`-typed default branch makes a new verdict case a *compile error* until it is rendered.
 */

import { Check, CircleHelp, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CampaignReminderCheckbox } from "@/application/campaign/campaign-reminder-for";
import type { CounterCustomerView } from "@/application/customers/lookup-customer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { balanceKind } from "@/domain/distribution/balance";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { BALANCE_STYLES, GROUP_STYLES } from "../accents";
import { CampaignReminderField } from "../campaign-reminder-field";
import { STATUS_CHROME, StateWord } from "../kunden/state-word";
import { Stat } from "../stat";
import { NotesControls } from "./notes-controls";
import { PaidTile } from "./serve-form";

/**
 * What the chip says over and above its colour: an icon and a headline readable from a metre away.
 * The block reason is not in it — it is the household's, and stands with the household's facts.
 */
interface Statement {
  readonly tone: Tone;
  readonly headline: string;
}

/**
 * The answers a staff member acts on, plus the two that ask for nothing. `serve` paints no chip —
 * the green button is the signal (US-41.4). `done` is a household who has already collected — a
 * fact about the afternoon rather than a refusal, and since looking one up again is the ordinary
 * way to a correction (US-32), painting it red would report a fault where none is.
 */
type Tone = "serve" | "warn" | "refuse" | "unknown" | "done";

/**
 * The paint and the icon per tone. The icon is decorative and hidden from screen readers, which get
 * the sentence instead.
 *
 * The traffic light is literal palette values, not theme tokens: those three must not move when the
 * theme does. Amber for an expired certificate rather than red is the point of US-06 — the verdict is
 * still "serve". The two that are not a traffic light take the theme's tokens, there being no signal
 * in them to keep still (`docs/guideline/ui_styling_guide.md` §12).
 */
const TONES = {
  warn: { className: "bg-amber-500 text-black ring-black/10", Icon: TriangleAlert },
  refuse: { className: "bg-red-700 text-white ring-black/10", Icon: X },
  unknown: { className: "bg-muted text-foreground ring-foreground/10", Icon: CircleHelp },
  done: { className: "bg-muted text-foreground ring-foreground/10", Icon: Check },
} as const satisfies Record<Exclude<Tone, "serve">, { className: string; Icon: LucideIcon }>;

/**
 * The German statement for one verdict.
 *
 * @throws {TypeError} never in practice — the `never` binding in the default branch is a compile-time
 * check that every case above it has been handled.
 */
function statementFor(verdict: Verdict): Statement {
  const words = de.distribution.counter.verdicts;
  switch (verdict.kind) {
    case "NOT_FOUND":
      return { tone: "unknown", headline: words.notFound.headline };
    case "ARCHIVED":
      // The badge below says „archiviert“ and the button is greyed, so a „nicht ausgeben“ would be
      // the screen narrating what it has already done.
      return { tone: "refuse", headline: words.archived.headline };
    case "BLOCKED":
      return { tone: "refuse", headline: words.blocked.headline };
    case "WRONG_GROUP":
      // Both colours are already on screen in words, as US-03.4 requires anyway.
      return { tone: "refuse", headline: words.wrongGroup.headline };
    case "OUTDATED_CARD":
      // The card that counts is the current one, and the household row prints it.
      return { tone: "refuse", headline: words.outdatedCard.headline };
    case "ALREADY_SERVED":
      return { tone: "done", headline: words.alreadyServed.headline };
    case "CLEAR_TO_SERVE":
      return { tone: "serve", headline: words.clearToServe.headline };
    case "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED":
      // The green button beside it says „serve“; the chip only has to add „expired“.
      return { tone: "warn", headline: words.certificateExpired.headline };
    default: {
      const unhandled: never = verdict;
      throw new TypeError(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The verdict as the status slot's chip (US-41.4). „Ausgabe frei“ paints nothing — the green button
 * is the signal — and is still said, so a screen reader hears every verdict. `servedAt` is the time
 * of today's record, which is how an already-served household is recognised.
 */
export function VerdictChip({
  verdict,
  servedAt,
}: {
  verdict: Verdict;
  servedAt: string | null;
}): React.ReactElement {
  const { tone, headline } = statementFor(verdict);
  if (tone === "serve") {
    return (
      <span data-testid="counter-verdict-headline" className="sr-only">
        {headline}
      </span>
    );
  }
  const { className, Icon } = TONES[tone];
  return (
    <p
      className={`flex h-12 items-center gap-2 rounded-[10px] px-4 text-base font-semibold ring-1 ${className}`}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} />
      <span>
        <span data-testid="counter-verdict-headline">{headline}</span>
        {verdict.kind === "ALREADY_SERVED" && servedAt !== null ? (
          <span className="tabular-nums">
            {de.distribution.counter.verdicts.alreadyServed.at(servedAt)}
          </span>
        ) : null}
      </span>
    </p>
  );
}

/** A field that is read only when it matters: the certificate, the reminder tally, a no-show run. */
function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}): React.ReactElement {
  return (
    <TableRow>
      <TableHeadCell>{label}</TableHeadCell>
      <TableCell className="font-medium tabular-nums">
        <span data-testid={testId}>{value}</span>
      </TableCell>
    </TableRow>
  );
}

/** The label column. A `<th>` in a key/value table, so the value's row header is announced with it. */
function TableHeadCell({ children }: { children: string }): React.ReactElement {
  return (
    <th scope="row" className="w-72 p-2 text-left align-middle font-normal text-muted-foreground">
      {children}
    </th>
  );
}

/** The mask's tile: a `Stat` at the size the row of six has room for (US-41.5). */
const TILE = "gap-0.5 rounded-lg bg-muted/60 px-3 py-1.5";
const TILE_VALUE = "text-2xl";

/** A label over a figure at the name's size — the two things the counter reads out and compares. */
function Headline({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * The household inside the mask: who they are on one line, what they draw and owe as tiles under it.
 *
 * Ordered as the counter uses it: the name and the card are compared against the person and the card
 * across the table, so they lead at the largest size; the group and the status decide whether the
 * rest matters, and wear what they wear everywhere else. The customer number is not repeated — it
 * stands in the field it was typed into.
 */
export function HouseholdRows({
  customer,
  customerId,
  campaignReminder,
}: {
  customer: CounterCustomerView;
  /** The surrogate id the record lives under. Not on `CounterCustomerView` — it is `CounterLookup`'s. */
  customerId: number;
  campaignReminder: CampaignReminderCheckbox | null;
}): React.ReactElement {
  const words = de.distribution.counter.mask;
  const kind = balanceKind(customer.balanceCents);

  return (
    <div data-testid="counter-customer" className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-1 items-end gap-x-6 gap-y-3 border-t pt-4 md:grid-cols-12">
          <Headline label={words.name} className="md:col-span-6">
            <h2
              data-testid="counter-name"
              className="text-[28px] leading-tight font-semibold break-words"
            >
              {customer.lastName}, {customer.firstName}
            </h2>
          </Headline>
          <Headline label={words.card} className="md:col-span-2">
            <span
              data-testid="counter-card-number"
              className="text-[28px] leading-tight font-semibold tabular-nums"
            >
              {customer.cardNumber}
            </span>
          </Headline>
          {/* The way onto the whole record rides beside the household rather than below the serve
              button: it is a fact about *them*, not a step in serving them (US-16.5). */}
          <div className="flex flex-wrap items-center gap-3 md:col-span-4 md:justify-end">
            <Badge
              data-testid="counter-group"
              variant="outline"
              className={GROUP_STYLES[customer.group]}
            >
              {de.customers.groups[customer.group]}
            </Badge>
            <StateWord
              word={de.customers.status[customer.status]}
              testId="counter-status"
              chrome={STATUS_CHROME[customer.status]}
            />
            <Button variant="ghost" asChild>
              <Link href={`/kunden/${customerId}`} data-testid="counter-record-link">
                {de.distribution.counter.recordLink}
              </Link>
            </Button>
          </div>
        </div>
        {/* Quiet on purpose: a card that has fallen behind is never grounds to turn anyone away
            (US-13.4, FR-5). */}
        {customer.staleCard === null ? null : (
          <p data-testid="counter-stale-card" className="text-xs text-muted-foreground">
            {de.distribution.counter.staleCard(
              customer.cardNumber,
              de.customers.derived.countsValue(
                customer.countsOnCard.grownUps,
                customer.countsOnCard.children,
              ),
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 md:grid-cols-12">
        <div className="flex gap-3 md:col-span-3">
          <Stat
            label={words.grownUps}
            value={String(customer.grownUps)}
            testId="counter-grown-ups"
            className={cn(TILE, "w-24")}
            valueClassName={TILE_VALUE}
          />
          <Stat
            label={words.children}
            value={String(customer.children)}
            testId="counter-children"
            className={cn(TILE, "w-24")}
            valueClassName={TILE_VALUE}
          />
        </div>
        {/* A household entitled to none reads 0 rather than nothing: the counter has to see that the
            question was answered (US-27). */}
        <div className="flex md:col-span-3">
          <Stat
            label={de.customers.derived.eggs}
            value={String(customer.eggs)}
            testId="counter-eggs"
            className={cn(TILE, "w-24")}
            valueClassName={TILE_VALUE}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 md:col-span-6">
          <div className="flex flex-wrap items-start gap-3">
            <PaidTile />
            {/* Signed, and tinted off the same `balanceKind` call: the colour never travels alone
                (US-03.4). „ausgeglichen“ is a word, so it steps down to fit the tile. */}
            <Stat
              label={de.customers.derived.balance}
              value={de.customers.derived.balanceValue(kind, customer.balanceCents)}
              testId="counter-balance"
              className={cn(TILE, "w-[164px]", BALANCE_STYLES[kind])}
              valueClassName={cn(TILE_VALUE, kind === "SETTLED" && "text-lg leading-8")}
            />
          </div>
          {customer.status === "ARCHIVED" ? null : campaignReminder === null ? (
            <p
              data-testid="campaign-reminder-none"
              className="flex w-40 items-center self-stretch rounded-lg border px-3 text-xs text-muted-foreground"
            >
              {words.noCampaignReminder}
            </p>
          ) : (
            // Keyed by customer: the optimistic tick must not survive into the next household.
            <CampaignReminderField
              key={`campaign-${customerId}`}
              reminderId={campaignReminder.reminderId}
              customerId={customerId}
              name={campaignReminder.name}
              received={campaignReminder.received}
              tile
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What the mask does not hold yet: the certificate, the reminder tally, a no-show run and the note.
 * Rows 4 and 5 take them over (US-41.6, US-41.7).
 */
export function HouseholdFacts({
  customer,
  customerId,
  verdict,
}: {
  customer: CounterCustomerView;
  customerId: number;
  verdict: Verdict;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        {/* The record of why this household was blocked (US-08), verbatim and with its paragraphs:
            nothing else on the screen holds it. Row 5 takes it over (US-41.7). */}
        {verdict.kind === "BLOCKED" ? (
          <p
            data-testid="counter-verdict-detail"
            className="max-w-prose text-base whitespace-pre-line"
          >
            {verdict.reason ?? de.distribution.counter.verdicts.blocked.noReason}
          </p>
        ) : null}
        <Table>
          <TableBody>
            <Field
              label={de.customers.fields.certificateValidUntil}
              value={germanDate(customer.certificateValidUntil)}
              testId="counter-certificate-valid-until"
            />
            <Field
              label={de.distribution.counter.details.reminderCount}
              value={String(customer.reminderCount)}
              testId="counter-reminder-count"
            />
            {/* The second archiving trigger (US-10.4), shown only when there is a run to see. A
                number and nothing more — no threshold, no warning (PRD §5). */}
            {customer.consecutiveNoShows === 0 ? null : (
              <Field
                label={de.customers.derived.noShows}
                value={de.customers.derived.noShowsValue(customer.consecutiveNoShows)}
                testId="counter-no-shows"
              />
            )}
          </TableBody>
        </Table>
        {/* `whitespace-pre-line`: a note is typed into a multi-line field, and a colleague's
            paragraphs must reach the counter. No fold for an archived household — `updateNotes`
            refuses one. Keyed by customer: a `<details>` keeps `open` through a soft navigation,
            which could carry one household's text onto the next (`ui_styling_guide.md` §6). */}
        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-sm text-muted-foreground">{de.customers.record.notesHeading}</span>
          <p data-testid="counter-notes" className="max-w-prose whitespace-pre-line">
            {customer.notes === "" ? de.distribution.counter.details.noNotes : customer.notes}
          </p>
          {customer.status === "ARCHIVED" ? null : (
            <NotesControls key={customerId} customerId={customerId} notes={customer.notes} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
