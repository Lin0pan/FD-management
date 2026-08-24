/**
 * The Kunden-verwalten hub at /kunden (US-15.3, extended by tasks/prd-us-17-navigation-shell.md
 * §US-17.2).
 *
 * It is the customer list and, above it, the three things staff do with customers: take somebody on,
 * work the waiting list, print the cards that have fallen behind. The section has one name — the nav
 * item and this heading are the same words — so following "Kunden verwalten" lands on a page that
 * says it back.
 *
 * This is the screen that replaces the spreadsheet, so it is built the way the sheet was read: one
 * dense table, sorted by customer number, with the filters above it and nothing between the rows.
 * Every value in it is already worked out — `listCustomers` derives the counts from the birthdates,
 * the portions and price from the settings in force today, the card number from the slot and the
 * certificate's state from today's date. This page lays them out and computes nothing.
 *
 * It is a **read**, entirely: a plain GET form carries the filters, which is what puts them in the
 * URL (FR-5). That is not a technicality — DF share one machine, and "the list I was looking at" has
 * to survive a reload and be passable to a colleague as a link.
 *
 * The group balance stands above the table and deliberately does not move with the filters: it is
 * the number staff assign a new household's group by (US-01), and it counts every active household
 * whatever is currently on screen.
 *
 * The screen is two cards — the overview and the list. One job runs through it: **find a
 * household.** Everything else earns its place by being a single glance (the balance, the three
 * actions) or an aid to
 * finding (the filters), which is why the filters live inside the list card rather than above it and
 * why the primary action stands beside the `h1` rather than in a band of its own.
 */

import { Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { countCardsDueForReissue } from "@/application/customers/cards-due-for-reissue";
import {
  listCustomers,
  type CustomerListRow,
  type CustomerListView,
} from "@/application/customers/list-customers";
import { proposeRegistration } from "@/application/customers/propose-registration";
import { listWaiting } from "@/application/waiting-list/list-waiting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXPIRING_SOON_DAYS, type CertificateState } from "@/domain/customer/certificate";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { FREE_SLOT_ACCENT, GROUP_STYLES } from "../accents";
import { selectClass } from "../select";
import { waitingListDeps } from "../warteliste/deps";
import { customerDeps } from "./deps";
import { SHELL } from "../shell";
import { STATUS_CHROME, StateWord, type Chrome } from "./state-word";

/**
 * Half of what the list shows changes at midnight with nothing being written — a 13th birthday moves
 * a head from one column to the other, and a certificate lapses the same way. A cached render would
 * be a screen that quietly stopped being true.
 */
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["ACTIVE", "BLOCKED", "ARCHIVED"] as const;
const GROUP_OPTIONS = ["RED", "BLUE"] as const;
const CERTIFICATE_OPTIONS = ["VALID", "EXPIRING_SOON", "EXPIRED"] as const;

/**
 * The filters as the URL carries them, in German like every other query parameter in the product.
 *
 * Every field falls back to "not filtered" rather than refusing the page: a query string is typed by
 * hand and copied between colleagues as readily as it is produced by the form, and an unreadable
 * `status=foo` is a filter nobody set, not a broken register. The unset option of each select submits
 * an empty string, which lands here as exactly the same answer.
 */
const filterParams = z.object({
  suche: z.string().optional().catch(undefined),
  status: z.enum(STATUS_OPTIONS).optional().catch(undefined),
  gruppe: z.enum(GROUP_OPTIONS).optional().catch(undefined),
  nachweis: z.enum(CERTIFICATE_OPTIONS).optional().catch(undefined),
  /** A checkbox: present and `1` when ticked, absent otherwise — so the default is a clean URL. */
  archiv: z.literal("1").optional().catch(undefined),
});

type Filters = z.infer<typeof filterParams>;

/** The chrome for a certificate state — `null` for the one that is simply normal. */
const CERTIFICATE_CHROME: Record<CertificateState, Chrome | null> = {
  VALID: null,
  EXPIRING_SOON: { variant: "outline", className: "border-amber-500/40 bg-amber-500/10" },
  EXPIRED: { variant: "outline", className: "border-red-500/40 bg-red-500/10" },
};

/** The three filter selects, styled from the same string so they cannot drift apart. */
const FILTER_SELECT = selectClass("h-9");

/** The German name of a certificate state as a *filter option*, which spells out what it includes. */
function certificateFilterLabel(state: CertificateState): string {
  const labels: Record<CertificateState, string> = {
    VALID: de.customerList.certificateFilters.VALID,
    EXPIRING_SOON: de.customerList.certificateFilters.expiringSoon(EXPIRING_SOON_DAYS),
    EXPIRED: de.customerList.certificateFilters.EXPIRED,
  };
  return labels[state];
}

/**
 * The filters in force, in German, for the message that stands where an empty table would.
 *
 * Whether archived households are included is named every time, even though it is a default: "keine
 * Treffer" under a hidden-by-default filter is precisely how a staff member concludes that a
 * household was deleted (US-11, PRD §6).
 */
function activeFilters(filters: Filters, search: string): ReadonlyArray<string> {
  const named: string[] = [];
  if (search !== "") {
    named.push(de.customerList.empty.search(search));
  }
  if (filters.status !== undefined) {
    named.push(de.customerList.empty.status(de.customers.status[filters.status]));
  }
  if (filters.gruppe !== undefined) {
    named.push(de.customerList.empty.group(de.customers.groups[filters.gruppe]));
  }
  if (filters.nachweis !== undefined) {
    named.push(de.customerList.empty.certificate(certificateFilterLabel(filters.nachweis)));
  }
  named.push(
    filters.archiv === "1"
      ? de.customerList.empty.archivedIncluded
      : de.customerList.empty.archivedHidden,
  );
  return named;
}

function CustomerRow({ row }: { row: CustomerListRow }): React.ReactElement {
  // An archived household is dimmed *and* carries the word "archiviert" in its status cell. The
  // shading alone would be a distinction only some readers can make, and this is the one row on the
  // screen whose customer number may already belong to somebody else (US-10).
  const archived = row.status === "ARCHIVED";

  return (
    <TableRow
      data-testid="customer-row"
      data-customer-number={row.customerNumber}
      data-status={row.status}
      className={archived ? "bg-muted/50 text-muted-foreground" : undefined}
    >
      <TableCell data-testid="customer-row-number" className="text-right tabular-nums">
        {row.customerNumber}
      </TableCell>
      <TableCell className="min-w-56">
        {/* Underlined on hover rather than always: 240 permanent underlines is 240 pieces of noise,
            and the whole row lights up under the cursor anyway. */}
        <Link
          href={`/kunden/${row.customerId}`}
          data-testid="customer-row-link"
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.lastName}, {row.firstName}
        </Link>
      </TableCell>
      <TableCell data-testid="customer-row-card" className="tabular-nums">
        {row.cardNumber}
      </TableCell>
      <TableCell>
        <Badge
          data-testid="customer-row-group"
          variant="outline"
          className={GROUP_STYLES[row.group]}
        >
          {de.customers.groups[row.group]}
        </Badge>
      </TableCell>
      <TableCell>
        <StateWord
          word={de.customers.status[row.status]}
          testId="customer-row-status"
          chrome={STATUS_CHROME[row.status]}
        />
      </TableCell>
      {/* Two heads in one cell, and deliberately two spans rather than one reading "4 + 0": the
          grown-ups and the children are separate facts that happen to be read together. */}
      <TableCell className="text-right tabular-nums">
        <span data-testid="customer-row-grown-ups">{row.grownUps}</span>
        {" + "}
        <span data-testid="customer-row-children">{row.children}</span>
      </TableCell>
      <TableCell data-testid="customer-row-portions" className="text-right tabular-nums">
        {row.portions}
      </TableCell>
      <TableCell data-testid="customer-row-price" className="text-right tabular-nums">
        {formatEuros(row.priceCents)}
      </TableCell>
      {/* The date and where it stands today, side by side: the state is what staff scan for, the
          date is what they say to the household. */}
      <TableCell>
        <span data-testid="customer-row-certificate" className="tabular-nums">
          {germanDate(row.certificateValidUntil)}
        </span>{" "}
        <StateWord
          word={de.customerList.certificateStates[row.certificateState]}
          testId="customer-row-certificate-state"
          chrome={CERTIFICATE_CHROME[row.certificateState]}
        />
      </TableCell>
      <TableCell
        data-testid="customer-row-reminders"
        className={`text-right tabular-nums ${row.reminderCount === 0 ? "text-muted-foreground" : ""}`}
      >
        {row.reminderCount === 0 ? de.customerList.table.noReminders : row.reminderCount}
      </TableCell>
    </TableRow>
  );
}

/**
 * One filter control and the label that names it.
 *
 * A real `<label htmlFor>` and not a nested `<span>`: the old idiom worked only because the control
 * sat *inside* the label, which stops being true the moment a control is moved. A plain `<label>`
 * rather than the `Label` primitive, which is `"use client"` and would drag the whole form across a
 * client boundary for a font weight.
 */
function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The filters, as a plain GET form, inside the list card they belong to.
 *
 * No JavaScript is involved: submitting navigates, which is what writes the filters into the URL and
 * makes the view bookmarkable. Every control is labelled, and the unset option of each select says
 * "Alle" rather than being blank.
 *
 * The three selects stay **native** `<select>` elements, styled with the theme tokens. Radix's
 * `Select` renders a button plus a portalled listbox, which neither `selectOption` nor `toHaveValue`
 * can drive — the same trade the conversion guide records for `Label`. The search box is given the
 * widest track of the four because it is the control the screen exists for.
 *
 * **„Zurücksetzen" is a plain `<a>`, not a `Link`**, and that is the whole of the fix it was: every
 * control here is uncontrolled, and React writes `defaultValue` and `defaultChecked` on mount only.
 * A router navigation to `/kunden` re-renders this same segment, so React reconciles the existing
 * DOM — and a field the staff member has typed in or picked from is dirty, which means the browser
 * keeps its value against the new default. The table came back unfiltered while these four controls
 * went on showing filters that were no longer applied: a screen contradicting itself, and precisely
 * the state nobody could read off a screenshot. A document navigation builds the form from scratch.
 * Submitting is a native GET submission and therefore already one, which is why only the reset ever
 * showed this.
 */
function FilterForm({ filters, search }: { filters: Filters; search: string }): React.ReactElement {
  return (
    <form method="get" className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))]">
        <FilterField id="filter-search" label={de.customerList.search.label}>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="filter-search"
              // Not `type="number"`: the same box takes a name and a card number's `k`.
              type="text"
              name="suche"
              data-testid="customer-search"
              placeholder={de.customerList.search.placeholder}
              defaultValue={search}
              autoComplete="off"
              className="h-9 pl-8"
            />
          </div>
        </FilterField>

        <FilterField id="filter-status" label={de.customerList.filters.status}>
          <select
            id="filter-status"
            name="status"
            data-testid="status-filter"
            defaultValue={filters.status ?? ""}
            className={FILTER_SELECT}
          >
            <option value="">{de.customerList.filters.all}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {de.customers.status[status]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField id="filter-group" label={de.customerList.filters.group}>
          <select
            id="filter-group"
            name="gruppe"
            data-testid="group-filter"
            defaultValue={filters.gruppe ?? ""}
            className={FILTER_SELECT}
          >
            <option value="">{de.customerList.filters.all}</option>
            {GROUP_OPTIONS.map((group) => (
              <option key={group} value={group}>
                {de.customers.groups[group]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField id="filter-certificate" label={de.customerList.filters.certificate}>
          <select
            id="filter-certificate"
            name="nachweis"
            data-testid="certificate-filter"
            defaultValue={filters.nachweis ?? ""}
            className={FILTER_SELECT}
          >
            <option value="">{de.customerList.filters.all}</option>
            {CERTIFICATE_OPTIONS.map((state) => (
              <option key={state} value={state}>
                {certificateFilterLabel(state)}
              </option>
            ))}
          </select>
        </FilterField>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Ticked deliberately, never by default (FR-4). Unticked it submits nothing at all, so the
            plain /kunden URL is the working view of who DF serves. Native, because the action reads
            it as presence in the FormData and Radix's Checkbox submits nothing of its own. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              id="filter-archived"
              type="checkbox"
              name="archiv"
              value="1"
              data-testid="archived-toggle"
              defaultChecked={filters.archiv === "1"}
              className="size-4 accent-primary"
            />
            <label htmlFor="filter-archived" className="text-sm">
              {de.customerList.filters.includeArchived}
            </label>
          </div>
          <p className="max-w-prose text-xs text-muted-foreground">
            {de.customerList.filters.includeArchivedHint}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg">
            {de.customerList.filters.submit}
          </Button>
          {/* A plain `<a>`, and the one link on the screen that is deliberately not a `Link`: see
              the note above. */}
          <Button variant="ghost" size="lg" asChild>
            <a href="/kunden">{de.customerList.filters.reset}</a>
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The overview card: the group balance, and the two customer actions that are not the primary one.
 *
 * The reissue link carries its count so that "nothing to do" can be read without opening the list —
 * which is why it is shown at zero as well (US-13.4). It is deliberately the same neutral grey as
 * everything around it: a stale card is never a reason to turn a household away, and a badge that
 * looks like an alarm is how staff learn to ignore the list it counts (PRD §6).
 *
 * The waiting list carries the same badge, in the same shape, for the same reason (US-18.1): the two
 * are one row of counts, read the same way, rather than two widgets competing for attention. Each
 * badge sits *inside* its link, so the number is part of what is clicked rather than a figure
 * standing beside it.
 *
 * `freeSlot` is the one thing that separates them: a queue that can be served *now* reads
 * differently from a queue that merely exists (US-18.2). It still names nobody — who gets the number
 * is decided on `/kunden/neu`, not here.
 *
 * The balance sits beneath them and deliberately does not move with the filters: it answers "which
 * group is smaller", which is a question about the whole register (FR-3). Its wording is one string
 * and stays one string — two tiles would read better and cannot carry it, so that is a change for
 * its own commit rather than a thing to smuggle into a restyle.
 */
function Overview({
  cardsDue,
  waiting,
  freeSlot,
  groupCounts,
}: {
  cardsDue: number;
  waiting: number;
  freeSlot: boolean;
  groupCounts: { readonly red: number; readonly blue: number };
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{de.customerList.overviewTitle}</h2>
        </CardTitle>
        <CardAction data-testid="customer-actions" className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="lg" asChild>
            <Link href="/warteliste" data-testid="hub-waiting-list">
              {de.customerList.actions.waitingList}
              {/* The state is on the element as data, not only in its colour, so a spec asserts what
                  the badge means rather than what shade it happens to be painted. */}
              <Badge
                variant="secondary"
                data-testid="waiting-list-badge"
                data-free-slot={freeSlot ? "true" : "false"}
                className={freeSlot ? FREE_SLOT_ACCENT : undefined}
              >
                {de.customerList.actions.waitingListBadge(waiting, freeSlot)}
              </Badge>
            </Link>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <Link href="/karten-neuausstellung" data-testid="hub-cards-due">
              {de.customerList.actions.cardsDue}
              <Badge variant="secondary" data-testid="cards-due-badge">
                {de.customerList.actions.cardsDueBadge(cardsDue)}
              </Badge>
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      {/* The balance and its explanation side by side rather than stacked: the sentence is what the
          number means, and a screen whose first job is the register below cannot spend a band on
          each of them. */}
      <CardContent className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          data-testid="group-counts"
          data-red={groupCounts.red}
          data-blue={groupCounts.blue}
          className="text-2xl font-semibold tabular-nums"
        >
          {de.customerList.groupBalance(groupCounts.red, groupCounts.blue)}
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {de.customerList.groupBalanceHint}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The register itself.
 *
 * The header sticks, which took three separate overflow overrides and had never once worked before
 * (see `docs/guideline/ui_styling_guide.md` §3): `Card` ships `overflow-hidden`, the `Table` primitive wraps
 * itself in `overflow-x-auto`, and either one on its own makes *itself* the scrollport the header
 * sticks to — so the header parks at the top of a box as tall as the table and leaves the window
 * with the rows. Below `xl` the container keeps its horizontal scroll and the header gives up
 * sticking, which is the right way round: DF work at desktop width, and a table that cannot be
 * scrolled sideways on a narrow screen is worse than one whose header scrolls away.
 *
 * `xl` and not `lg`, measured rather than guessed: ten columns need about 1000px, which a `lg`
 * viewport's content box does not have, so turning the scroll container off there pushed the whole
 * *page* sideways by 26px. The width the concept names as the target is 1280 anyway.
 *
 * `top-12` is the height of the sticky nav above it, and the background is `bg-card` and opaque —
 * the nav is translucent, and a header that copied that would have rows reading through it.
 */
function CustomerTable({ rows }: { rows: ReadonlyArray<CustomerListRow> }): React.ReactElement {
  return (
    <Table data-testid="customer-table" containerClassName="overflow-x-auto xl:overflow-x-visible">
      <TableHeader className="sticky top-12 z-10 bg-card">
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-right">{de.customerList.table.customerNumber}</TableHead>
          <TableHead>{de.customerList.table.name}</TableHead>
          <TableHead>{de.customerList.table.cardNumber}</TableHead>
          <TableHead>{de.customerList.table.group}</TableHead>
          <TableHead>{de.customerList.table.status}</TableHead>
          <TableHead className="text-right">{de.customerList.table.household}</TableHead>
          <TableHead className="text-right">{de.customerList.table.portions}</TableHead>
          <TableHead className="text-right">{de.customerList.table.price}</TableHead>
          <TableHead>{de.customerList.table.certificate}</TableHead>
          <TableHead className="text-right">{de.customerList.table.reminders}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <CustomerRow key={row.customerId} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * What the screen says when DF has not configured anything yet: the list cannot price a household
 * before a portion has a price (US-14). The register is not broken, the installation is unfinished,
 * so the page says so and points at the settings rather than being an error screen.
 */
function NoSettings(): React.ReactElement {
  return (
    <main className={SHELL}>
      <h1 className="text-3xl font-semibold tracking-tight">{de.customerList.heading}</h1>
      <Alert>
        <AlertDescription>{de.settings.errors.noSettings}</AlertDescription>
      </Alert>
      <Button className="self-start" asChild>
        <Link href="/einstellungen">{de.home.settingsLink}</Link>
      </Button>
    </main>
  );
}

export default async function CustomerListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const filters = filterParams.parse(await searchParams);
  const search = filters.suche?.trim() ?? "";

  let view: CustomerListView;
  try {
    view = await listCustomers(customerDeps, {
      search,
      // One status or none. A subset is what the use case takes, but a staff member filtering a list
      // asks for one thing at a time, and a multi-select would be a control to learn rather than a
      // question to answer (PRD §6).
      status: filters.status === undefined ? undefined : [filters.status],
      group: filters.gruppe,
      certificate: filters.nachweis,
      includeArchived: filters.archiv === "1",
    });
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return <NoSettings />;
    }
    throw error;
  }

  // The hub's two signals, both of which the list itself cannot show: how many cards have fallen
  // behind, and how many applicants are waiting — the latter marked when a customer number is free.
  const [cardsDue, places, proposal] = await Promise.all([
    countCardsDueForReissue(customerDeps),
    listWaiting(waitingListDeps),
    // Settings were in force a moment ago — `listCustomers` needs them too — but a saved change is in
    // force immediately, so the answer is caught here as well: no quota means no answer about a free
    // slot, and the badge states its count in the neutral state rather than the page being an error.
    proposeRegistration(customerDeps).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NoSettingsInForce") {
        return null;
      }
      throw error;
    }),
  ]);

  // Whether anybody is waiting at all. Who that is belongs to /kunden/neu, where the number is
  // handed out — the hub deliberately names nobody (US-18.3).
  const anybodyWaiting = places.length > 0;
  const freeNumber = proposal?.customerNumber ?? null;

  const filtered = activeFilters(filters, search);
  // "Nothing is filtered" is the plain /kunden URL: the archived clause is always in `filtered`, so
  // it alone does not make the register look filtered.
  const unfiltered = filtered.length === 1 && filters.archiv === undefined;

  return (
    <main className={SHELL}>
      {/* The one *write* on this screen stands beside the heading, where the page skeleton puts a
          screen's primary action — rather than opening a band of its own above the register. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.customerList.heading}</h1>
        <Button size="lg" asChild>
          <Link href="/kunden/neu" data-testid="hub-new-customer">
            <UserPlus aria-hidden="true" />
            {de.customerList.actions.newCustomer}
          </Link>
        </Button>
      </div>

      {/* No banner here any more (US-18.3). Naming one applicant and one number at the top of the
          register was a decision about somebody else standing in front of the thing staff came for;
          it now stands on /kunden/neu, where the number is actually about to be handed out. What
          survives here is the badge — the same fact, stated quietly. */}
      <Overview
        cardsDue={cardsDue}
        waiting={places.length}
        // Both halves are required: a free number with nobody waiting is not news, and a queue with
        // no number to give out is the state the badge already states plainly (US-18.2).
        freeSlot={anybodyWaiting && freeNumber !== null}
        groupCounts={view.groupCounts}
      />

      {/* One card, because the filters have no meaning apart from the table they filter: a wrapped
          control row inside a card still reads as one form, which loose page furniture does not. */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>
            <h2>{de.customerList.listTitle}</h2>
          </CardTitle>
          {view.rows.length === 0 ? null : (
            <CardAction data-testid="customer-list-count" className="text-sm text-muted-foreground">
              {de.customerList.resultCount(view.rows.length)}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterForm filters={filters} search={search} />
          {view.rows.length === 0 ? (
            <Alert role="status">
              <AlertDescription data-testid="customer-list-empty">
                {unfiltered
                  ? de.customerList.empty.unfiltered
                  : de.customerList.empty.filtered(filtered.join(", "))}
              </AlertDescription>
            </Alert>
          ) : (
            <CustomerTable rows={view.rows} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
