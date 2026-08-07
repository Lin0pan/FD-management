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
import Link from "next/link";
import type { CounterCustomerView } from "@/application/customers/lookup-customer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { GROUP_STYLES } from "../accents";
import { STATUS_CHROME, StateWord } from "../kunden/state-word";
import { Stat } from "../stat";
import { NotesControls } from "./notes-controls";

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
 *
 * Ordered by how it is used rather than by how a record is normally written. The two numbers lead,
 * because the loop at the table is *call the number, check the card* and both of those are done at
 * arm's length; then the counts, portions and price; then the fields that are read only when
 * something is off. The name stays the heading — it is what the section is *about*, and the record
 * to fall back on when there is no card — but it is no longer the largest thing on the card.
 */
export function CustomerDetails({
  customer,
  customerId,
}: {
  customer: CounterCustomerView;
  /** The surrogate id the record lives under. Not on `CounterCustomerView` — it is `CounterLookup`'s. */
  customerId: number;
}): React.ReactElement {
  return (
    <Card data-testid="counter-customer">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h2 data-testid="counter-name">
            {customer.firstName} {customer.lastName}
          </h2>
        </CardTitle>
        {/* The group and the status, the two facts that decide whether the rest matters at all —
            wearing what they wear everywhere else in the application.

            Both used to be local tables here. The group was solid `bg-red-600 text-white`, a second
            copy of a tint that `accents.ts` exists to keep single, so one household's group was
            painted one way on their record and another at the counter. And the status badged every
            state including `aktiv`, which is nine records in ten: a pill that says "this one is
            normal" is texture, not emphasis, and `STATUS_CHROME` is where that judgement is already
            made. What is left is a mark per exception, the same mark the list and the record make.

            The way onto the whole record rides in the same corner (US-16.5). Everything the counter
            shows is a slice of it, and the question staff most often have next — who else lives
            there, what was noted, when did they last collect — is answered there and nowhere here.
            It belongs beside the household's name rather than below the serve button, because it is
            a fact about *them* and not a step in serving them; /kunden/[id] hangs the way to the
            card off its header row for the same reason. `gap-3` rather than `gap-2`: two badges
            beside each other need less air than a badge beside a control. */}
        <CardAction className="flex flex-wrap items-center gap-3">
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
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* The two numbers the counter actually runs on, and the reason they lead the card rather
            than sitting under the name in 14px grey, which is where they were.

            Neither is read silently. The Kundennummer is *called out* to fetch the next household —
            staff use it in preference to the name, which comes from any of a dozen languages and is
            not theirs to mispronounce in front of a room. The Kartennummer is compared, glyph by
            glyph, against the card being held out across the table. Both are read at arm's length
            and at a glance, which is a size argument, not a layout one: the screen had the name at
            24px and these two at 14px, and the name is the one thing here nobody says out loud.

            Bigger than the derived figures below them, so six tiles do not read as one undivided
            grid — the counts answer "how much", these answer "who", and the gap plus the step in
            size is what separates the questions. No colour: that budget is the verdict's.

            `Stat` because it already holds the label and the value in one `<p>` (a screen reader
            gets "Kundennummer 6", not two loose facts) and sets `tabular-nums`, which is what makes
            6k1 and 6k2 differ at a glance. The grid is the counts row's own, verbatim, so the pair
            takes the first two of the same four columns: identical widths on one baseline is what a
            comparison needs (`docs/ui_styling_guide.md` §4), and sharing the track keeps the card to
            one column rhythm instead of two that miss each other by a pixel. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={de.customers.fields.customerNumber}
            value={String(customer.customerNumber)}
            testId="counter-customer-number"
            valueClassName="text-4xl"
          />
          <Stat
            label={de.customers.fields.cardNumber}
            value={customer.cardNumber}
            testId="counter-card-number"
            valueClassName="text-4xl"
          />
        </div>
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
        {/* No "Standard-Portionen und -Preis; am Ausgabetisch nicht anpassbar." here, though the
            three screens that *can* edit a household still carry it. At the counter it described an
            absence: there is no control to adjust, so the sentence answered a question the screen
            had already answered by having no field to type in. */}
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
        {/* The note, and the way to write one without leaving the screen (US-16.3).

            `record.notesHeading` rather than `fields.notes`: „Bemerkung (optional)" is a *form
            field's* label, and above a paragraph it told the reader that a note they are looking at
            was optional to write. The „(optional)" survives on the field inside the fold, where it
            is the answer to a question somebody is about to ask.

            `whitespace-pre-line` for the same reason the block reason has it: a note is typed into
            a multi-line field, and the paragraphs a colleague wrote must reach the counter rather
            than collapse into one run-on line.

            No fold for an archived household — `updateNotes` refuses one, and the record screen
            already drops to read-only text there. A control that can only ever answer "nein" is
            worse than no control.

            Keyed by customer: a `<details>` keeps `open` through a soft navigation, and this screen
            navigates to itself from the group list, the walk and the lookup form
            (`docs/ui_styling_guide.md` §6). Without the key the next household's card arrives with the
            fold open and the previous household's text still in the field — which is the one way
            this control could write a note onto the wrong record. */}
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
