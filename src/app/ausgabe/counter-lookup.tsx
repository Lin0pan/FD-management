/**
 * The counter lookup: one input, one unmissable verdict, and everything needed to decide beneath it
 * (tasks/prd-us-04-lookup-customer.md §US-04.4).
 *
 * Nothing is decided here. `lookupCustomer` returns the verdict and the derived counts, portions and
 * price; this file only chooses the words, the colour and the icon for each case. Assembling the
 * judgement in JSX is the mistake `evaluateAtCounter` exists to prevent.
 *
 * The switch over the verdict union is exhaustive by construction: the `never`-typed default branch
 * makes a new verdict case a *compile error* until it is rendered, so no counter answer can ever be
 * a blank banner.
 */

import { Check, CircleHelp, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { CounterCustomerView } from "@/application/customers/lookup-customer";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { CustomerStatus } from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { Stat } from "../stat";

/**
 * What the banner has to say, over and above its colour: an icon, a headline readable from a metre
 * away, and — only where somebody typed one — a sentence.
 *
 * `detail` is `null` for every verdict the screen already answers by itself. "Ausgabe frei" needed
 * no "Portionen und Preis stehen unten" when the portions and the price are two tiles below it, and
 * the expired certificate's date and reminder count are rows in the same record. A sentence that
 * restates what is already on screen is not reassurance; it is one more thing to read with a queue
 * waiting. What survives is the block reason, because that is the one line no other element holds.
 */
interface Statement {
  readonly tone: Tone;
  readonly headline: string;
  readonly detail: string | null;
}

/** The three answers a staff member acts on: hand out, hand out and say something, or turn away. */
type Tone = "serve" | "warn" | "refuse" | "unknown";

/**
 * The paint and the icon per tone. The icon is decorative — it repeats the headline, never replaces
 * it — so it is hidden from screen readers, which get the sentence instead.
 *
 * The paint is literal palette values, not theme tokens: these four are the counter's traffic light
 * and must not move when the theme does. Amber for an expired certificate rather than red is the
 * point of US-06 — the verdict is still "serve".
 */
const TONES = {
  serve: { className: "bg-green-700 text-white ring-black/10", Icon: Check },
  warn: { className: "bg-amber-500 text-black ring-black/10", Icon: TriangleAlert },
  refuse: { className: "bg-red-700 text-white ring-black/10", Icon: X },
  unknown: { className: "bg-muted text-foreground ring-foreground/10", Icon: CircleHelp },
} as const satisfies Record<Tone, { className: string; Icon: LucideIcon }>;

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
      return { tone: "unknown", headline: words.notFound.headline, detail: null };
    case "ARCHIVED":
      // The status badge on the record below says "archiviert" and no serve action is offered, so
      // "nicht ausgeben" was the screen telling the reader what it had already done.
      return { tone: "refuse", headline: words.archived.headline, detail: null };
    case "BLOCKED":
      return {
        tone: "refuse",
        headline: words.blocked.headline,
        // The one verdict that keeps its sentence. The reason is the record of why this household
        // was blocked (US-08); it is shown verbatim because paraphrasing it at the counter would be
        // paraphrasing the decision itself, and nothing else on the screen holds it.
        detail: verdict.reason ?? words.blocked.noReason,
      };
    case "WRONG_GROUP":
      // Both colours are on screen in words — the household's on its badge, the week's in the
      // banner above — which US-03.4 requires of them anyway.
      return { tone: "refuse", headline: words.wrongGroup.headline, detail: null };
    case "OUTDATED_CARD":
      // The card that counts is the current one, and the record below prints it.
      return { tone: "refuse", headline: words.outdatedCard.headline, detail: null };
    case "ALREADY_SERVED_TODAY":
      return { tone: "refuse", headline: words.alreadyServedToday.headline, detail: null };
    case "CLEAR_TO_SERVE":
      return { tone: "serve", headline: words.clearToServe.headline, detail: null };
    case "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED":
      // The date is a row in the record, the count is the row under it, and the reminder button is
      // the amber control below — the headline only has to say that both are true at once.
      return { tone: "warn", headline: words.certificateExpired.headline, detail: null };
    default: {
      const unhandled: never = verdict;
      throw new TypeError(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The verdict, full width and stated in words — the one thing on this screen that cannot be missed.
 *
 * Only the headline is painted. Colour is the counter's traffic light, so it marks the verdict and
 * nothing else; the sentence that says what to *do* reads better as prose than as white-on-red, and
 * keeping it out of the field means the bar is one height whatever the sentence turns out to be — a
 * block reason typed by hand runs to paragraphs, and used to push the strip past 400px on a narrow
 * screen. The `<section>` still wraps both, so a screen reader reads verdict and instruction as one
 * answer rather than two loose paragraphs.
 */
export function VerdictBanner({ verdict }: { verdict: Verdict }): React.ReactElement {
  const { tone, headline, detail } = statementFor(verdict);
  const { className, Icon } = TONES[tone];

  return (
    <section
      data-testid="counter-verdict"
      data-verdict={verdict.kind}
      className="flex w-full flex-col gap-2"
    >
      {/* `text-3xl` is a floor, not a preference: this is read standing up with a queue waiting. */}
      <p className={`flex items-center gap-3 rounded-xl px-5 py-2.5 ring-1 ${className}`}>
        <Icon aria-hidden="true" className="size-6 shrink-0 md:size-7" strokeWidth={2.5} />
        <span data-testid="counter-verdict-headline" className="text-2xl font-bold sm:text-3xl">
          {headline}
        </span>
      </p>
      {/* `whitespace-pre-line` because a block reason is typed by hand into a multi-line field and
          is shown verbatim (US-08, FR-4): the paragraphs a colleague wrote have to survive to the
          counter, not collapse into one run-on line. */}
      {detail === null ? null : (
        <p
          data-testid="counter-verdict-detail"
          className="max-w-prose px-5 text-base whitespace-pre-line"
        >
          {detail}
        </p>
      )}
    </section>
  );
}

/** The badge variant per status. The group has its own paint; a status is a state, so it uses tokens. */
const STATUS_VARIANTS = {
  ACTIVE: "secondary",
  BLOCKED: "destructive",
  ARCHIVED: "outline",
} as const satisfies Record<CustomerStatus, "secondary" | "destructive" | "outline">;

/** The same paint as the week banner and the printed card, so the three are one colour to staff. */
const GROUP_STYLES = {
  RED: "bg-red-600 text-white",
  BLUE: "bg-blue-700 text-white",
} as const satisfies Record<Group, string>;

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

/**
 * Everything the counter decision rests on, all of it on screen at once: FR-2 is that no field here
 * costs a further click, because the queue does not wait while somebody opens a second screen.
 */
export function CustomerDetails({
  customer,
}: {
  customer: CounterCustomerView;
}): React.ReactElement {
  return (
    <Card data-testid="counter-customer">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h2 data-testid="counter-name">
            {customer.firstName} {customer.lastName}
          </h2>
        </CardTitle>
        <CardDescription>
          {de.customers.fields.customerNumber}{" "}
          <span data-testid="counter-customer-number" className="font-medium text-foreground">
            {String(customer.customerNumber)}
          </span>
          {" · "}
          {de.customers.fields.cardNumber}{" "}
          <span data-testid="counter-card-number" className="font-medium text-foreground">
            {customer.cardNumber}
          </span>
        </CardDescription>
        {/* The group and the status, the two facts that decide whether the rest matters at all. */}
        <CardAction className="flex flex-wrap items-center gap-2">
          <Badge data-testid="counter-group" className={GROUP_STYLES[customer.group]}>
            {de.customers.groups[customer.group]}
          </Badge>
          <Badge data-testid="counter-status" variant={STATUS_VARIANTS[customer.status]}>
            {de.customers.status[customer.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={de.customers.derived.grownUps}
            value={String(customer.grownUps)}
            testId="counter-grown-ups"
          />
          <Stat
            label={de.customers.derived.children}
            value={String(customer.children)}
            testId="counter-children"
          />
          <Stat
            label={de.customers.derived.portions}
            value={String(customer.portions)}
            testId="counter-portions"
          />
          <Stat
            label={de.customers.derived.price}
            value={formatEuros(customer.priceCents)}
            testId="counter-price"
          />
        </div>
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
            {/* The second archiving trigger (US-10.4), shown only when there is a run to see: a
                household that has quietly stopped coming is invisible at the counter otherwise. It is
                a number and nothing more — no threshold, no warning, no action follows from it
                (PRD §5). */}
            {customer.consecutiveNoShows === 0 ? null : (
              <Field
                label={de.customers.derived.noShows}
                value={de.customers.derived.noShowsValue(customer.consecutiveNoShows)}
                testId="counter-no-shows"
              />
            )}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">{de.customers.derived.standardValues}</p>
        {/* The stale-card note (US-13.4). Deliberately the smallest, quietest thing on the screen —
            the same grey as the hint above it, no border, no icon, no colour — because it is neither a
            verdict nor a warning: the verdict is the banner, and the serve action below is untouched
            by this. A card that has fallen behind is never grounds to turn anyone away (FR-5). */}
        {customer.staleCard === null ? null : (
          <p data-testid="counter-stale-card" className="max-w-prose text-xs text-muted-foreground">
            {customer.staleCard === "GROUP_CHANGE"
              ? de.distribution.counter.staleCardGroup(
                  customer.cardNumber,
                  de.customers.groups[customer.groupOnCard],
                  de.customers.groups[customer.group],
                )
              : de.distribution.counter.staleCard(
                  customer.cardNumber,
                  de.customers.derived.countsValue(
                    customer.countsOnCard.grownUps,
                    customer.countsOnCard.children,
                  ),
                  de.customers.derived.countsValue(customer.grownUps, customer.children),
                )}
          </p>
        )}
        <div className="flex flex-col gap-1 border-t pt-4">
          <span className="text-sm text-muted-foreground">{de.customers.fields.notes}</span>
          <p data-testid="counter-notes" className="max-w-prose">
            {customer.notes === "" ? de.distribution.counter.details.noNotes : customer.notes}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
