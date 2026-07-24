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

import type { CounterCustomerView } from "@/application/customers/lookup-customer";
import { formatCardNumber } from "@/domain/card/cardNumber";
import type { Verdict } from "@/domain/distribution/counterVerdict";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";

/**
 * What the banner has to say, over and above its colour: an icon, a headline readable from a metre
 * away, and the sentence that names the action.
 */
interface Statement {
  readonly tone: Tone;
  readonly headline: string;
  readonly detail: string;
}

/** The three answers a staff member acts on: hand out, hand out and say something, or turn away. */
type Tone = "serve" | "warn" | "refuse" | "unknown";

/**
 * The paint and the icon per tone. The icon is decorative — it repeats the headline, never replaces
 * it — so it is hidden from screen readers, which get the sentence instead.
 */
const TONES = {
  serve: { className: "bg-green-700 text-white", icon: "✓" },
  warn: { className: "bg-amber-500 text-black", icon: "!" },
  refuse: { className: "bg-red-700 text-white", icon: "✕" },
  unknown: { className: "bg-foreground/10 text-foreground", icon: "?" },
} as const satisfies Record<Tone, { className: string; icon: string }>;

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
      return { tone: "unknown", ...words.notFound };
    case "ARCHIVED":
      return { tone: "refuse", ...words.archived };
    case "BLOCKED":
      return {
        tone: "refuse",
        headline: words.blocked.headline,
        // The reason is the record of why this household was blocked (US-08); it is shown verbatim
        // because paraphrasing it at the counter would be paraphrasing the decision itself.
        detail: verdict.reason ?? words.blocked.noReason,
      };
    case "WRONG_GROUP":
      return {
        tone: "refuse",
        headline: words.wrongGroup.headline,
        detail: words.wrongGroup.detail(
          de.distribution.counter.customerOfColour[verdict.group],
          de.distribution.counter.weekOfColour[verdict.weekColour],
        ),
      };
    case "OUTDATED_CARD":
      return {
        tone: "refuse",
        headline: words.outdatedCard.headline,
        detail: words.outdatedCard.detail(
          formatCardNumber(verdict.presented.customerNumber, verdict.presented.index),
          formatCardNumber(verdict.current.customerNumber, verdict.current.index),
        ),
      };
    case "ALREADY_SERVED_TODAY":
      return { tone: "refuse", ...words.alreadyServedToday };
    case "CLEAR_TO_SERVE":
      return { tone: "serve", ...words.clearToServe };
    case "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED":
      return {
        tone: "warn",
        headline: words.certificateExpired.headline,
        detail: words.certificateExpired.detail(
          germanDate(verdict.validUntil),
          verdict.reminderCount,
        ),
      };
    default: {
      const unhandled: never = verdict;
      throw new TypeError(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** The verdict, full width and stated in words — the one thing on this screen that cannot be missed. */
export function VerdictBanner({ verdict }: { verdict: Verdict }): React.ReactElement {
  const { tone, headline, detail } = statementFor(verdict);

  return (
    <section
      data-testid="counter-verdict"
      data-verdict={verdict.kind}
      className={`flex w-full items-start gap-6 rounded-xl p-8 shadow-sm ${TONES[tone].className}`}
    >
      <span aria-hidden="true" className="text-5xl leading-none font-bold">
        {TONES[tone].icon}
      </span>
      <div className="flex flex-col gap-2">
        <p data-testid="counter-verdict-headline" className="text-4xl font-bold sm:text-5xl">
          {headline}
        </p>
        <p data-testid="counter-verdict-detail" className="max-w-prose text-xl">
          {detail}
        </p>
      </div>
    </section>
  );
}

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
    <p className="rounded border border-foreground/15 px-3 py-2">
      <span className="text-sm text-foreground/70">{label}: </span>
      <span data-testid={testId} className="font-medium tabular-nums">
        {value}
      </span>
    </p>
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
    <section data-testid="counter-customer" className="flex flex-col gap-4">
      <h2 data-testid="counter-name" className="text-2xl font-semibold">
        {customer.firstName} {customer.lastName}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={de.customers.fields.customerNumber}
          value={String(customer.customerNumber)}
          testId="counter-customer-number"
        />
        <Field
          label={de.customers.fields.cardNumber}
          value={customer.cardNumber}
          testId="counter-card-number"
        />
        <Field
          label={de.customers.fields.group}
          value={de.customers.groups[customer.group]}
          testId="counter-group"
        />
        <Field
          label={de.customers.fields.status}
          value={de.customers.status[customer.status]}
          testId="counter-status"
        />
        <Field
          label={de.customers.derived.grownUps}
          value={String(customer.grownUps)}
          testId="counter-grown-ups"
        />
        <Field
          label={de.customers.derived.children}
          value={String(customer.children)}
          testId="counter-children"
        />
        <Field
          label={de.customers.derived.portions}
          value={String(customer.portions)}
          testId="counter-portions"
        />
        <Field
          label={de.customers.derived.price}
          value={formatEuros(customer.priceCents)}
          testId="counter-price"
        />
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
      </div>
      <p className="text-xs text-foreground/60">{de.customers.derived.standardValues}</p>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customers.fields.notes}</span>
        <p data-testid="counter-notes" className="max-w-prose">
          {customer.notes === "" ? de.distribution.counter.details.noNotes : customer.notes}
        </p>
      </div>
    </section>
  );
}
