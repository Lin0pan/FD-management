/**
 * The Kunden-verwalten hub at /kunden (US-15.3, US-17.2) — the customer list and, above it, the three
 * things staff do with customers.
 *
 * Built the way the spreadsheet was read: one dense table sorted by customer number, filters above,
 * nothing between the rows. Every value is already worked out by `listCustomers`; this page lays them
 * out and computes nothing.
 *
 * **A read, entirely**: a plain GET form carries the filters, which is what puts them in the URL
 * (FR-5) — DF share one machine, and "the list I was looking at" has to survive a reload and be
 * passable to a colleague as a link.
 *
 * The group balance deliberately does not move with the filters: it answers a question about the
 * whole register (US-01).
 */

import { IdCard, Search, UserPlus, Users } from "lucide-react";
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
 * Half of what the list shows changes at midnight with nothing being written — a 13th birthday, a
 * lapsing certificate. A cached render would quietly stop being true.
 */
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["ACTIVE", "BLOCKED", "ARCHIVED"] as const;
const GROUP_OPTIONS = ["RED", "BLUE"] as const;
const CERTIFICATE_OPTIONS = ["VALID", "EXPIRING_SOON", "EXPIRED"] as const;

/**
 * The filters as the URL carries them, in German like every other query parameter. Every field falls
 * back to "not filtered" rather than refusing the page: a query string is typed and copied by hand,
 * and an unreadable `status=foo` is a filter nobody set, not a broken register.
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
 * The filters in force, for the line above the table and the message where it would be empty — one
 * list, so the two cannot name different filters. Archived households are named every time, default
 * or not: „keine Treffer“ under a hidden-by-default filter is how staff conclude a household was
 * deleted (US-11, PRD §6).
 */
function activeFilters(filters: Filters, search: string): ReadonlyArray<string> {
  const clauses = de.customerList.filterClauses;
  const named: string[] = [];
  if (search !== "") {
    named.push(clauses.search(search));
  }
  if (filters.status !== undefined) {
    named.push(clauses.status(de.customers.status[filters.status]));
  }
  if (filters.gruppe !== undefined) {
    named.push(clauses.group(de.customers.groups[filters.gruppe]));
  }
  if (filters.nachweis !== undefined) {
    named.push(clauses.certificate(certificateFilterLabel(filters.nachweis)));
  }
  named.push(filters.archiv === "1" ? clauses.archivedIncluded : clauses.archivedHidden);
  return named;
}

function CustomerRow({ row }: { row: CustomerListRow }): React.ReactElement {
  // Dimmed *and* carrying the word „archiviert“: shading alone is a distinction only some readers
  // can make, and this is the one row whose number may already belong to somebody else (US-10).
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
      {/* `min-w-64` and not `min-w-56`: when a column was dropped from this table (US-27), the
          width it paid back came here rather than being spread evenly over the rest. This is the
          column staff scan, and the only one holding text that can wrap. */}
      <TableCell className="min-w-64">
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
 * One filter control and the label that names it. A real `<label htmlFor>`, so it survives the
 * control being moved; a plain `<label>` rather than the `Label` primitive, which is `"use client"`
 * and would drag the whole form across a client boundary for a font weight.
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
 * The filters, as a plain GET form. No JavaScript: submitting navigates, which is what writes the
 * filters into the URL and makes the view bookmarkable.
 *
 * The three selects stay **native** `<select>` elements — Radix's `Select` renders a button plus a
 * portalled listbox, which neither `selectOption` nor `toHaveValue` can drive.
 *
 * **„Zurücksetzen“ is a plain `<a>`, not a `Link`.** Every control here is uncontrolled and React
 * writes `defaultValue` only on mount, so a router navigation reconciles the existing DOM and a dirty
 * field keeps its value against the new default — leaving an unfiltered table under four controls
 * still showing the old filters. A document navigation rebuilds the form. Submitting is already one,
 * which is why only the reset ever showed this.
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
 * Both links carry a count, shown at zero too, so "nothing to do" is readable without opening the
 * list (US-13.4, US-18.1). Neutral grey deliberately: a badge that looks like an alarm is how staff
 * learn to ignore the list it counts (PRD §6). Each badge sits *inside* its link, so the number is
 * part of what is clicked.
 *
 * `freeSlot` is the one thing separating them — a queue that can be served *now* reads differently
 * from one that merely exists (US-18.2) — and it still names nobody.
 *
 * The balance does not move with the filters: it answers a question about the whole register (FR-3).
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
              <Users aria-hidden="true" data-icon="inline-start" />
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
              {/* The card glyph the reissue controls wear, so the hub link and the action it
                  leads to read as one thing across three screens. */}
              <IdCard aria-hidden="true" data-icon="inline-start" />
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
 * **The sticky header takes three overflow overrides** (`docs/guideline/ui_styling_guide.md` §3):
 * `Card` ships `overflow-hidden` and `Table` wraps itself in `overflow-x-auto`, and either alone makes
 * *itself* the scrollport, so the header parks at the top of a box as tall as the table. Below `xl`
 * the container keeps its horizontal scroll and the header gives up sticking — measured, not guessed:
 * nine columns need about 1000px, which a `lg` content box does not have.
 *
 * **The stickiness carries the same `xl:` as the overflow, and has to.** A sticky offset is measured
 * from the scrollport, and which element that is changes at this breakpoint. `top-12` against a
 * container whose scroll top is 0 pushes the header 48px *down*, opaque, exactly over the first row —
 * which reads as a customer missing from the register, and flips on a resize or a zoom step.
 */
function CustomerTable({ rows }: { rows: ReadonlyArray<CustomerListRow> }): React.ReactElement {
  return (
    <Table data-testid="customer-table" containerClassName="overflow-x-auto xl:overflow-x-visible">
      <TableHeader className="z-10 bg-card xl:sticky xl:top-12">
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-right">{de.customerList.table.customerNumber}</TableHead>
          <TableHead>{de.customerList.table.name}</TableHead>
          <TableHead>{de.customerList.table.cardNumber}</TableHead>
          <TableHead>{de.customerList.table.group}</TableHead>
          <TableHead>{de.customerList.table.status}</TableHead>
          <TableHead className="text-right">{de.customerList.table.household}</TableHead>
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
 * What the screen says before DF has configured anything: the list cannot price a household before a
 * head has a price (US-14). The installation is unfinished rather than broken, so the page points at
 * the settings rather than being an error screen.
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
      // One status or none, though the use case takes a subset: a multi-select would be a control to
      // learn rather than a question to answer (PRD §6).
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

  // The hub's two signals, neither of which the list can show: cards fallen behind, and applicants
  // waiting — the latter marked when a customer number is free.
  const [cardsDue, places, proposal] = await Promise.all([
    countCardsDueForReissue(customerDeps),
    listWaiting(waitingListDeps),
    // Caught here as well as in `listCustomers`, because a saved change is in force immediately: no
    // quota means no answer about a free slot, and the badge falls back to its neutral state.
    proposeRegistration(customerDeps).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "NoSettingsInForce") {
        return null;
      }
      throw error;
    }),
  ]);

  // Whether anybody is waiting at all. Who that is belongs to /kunden/neu (US-18.3).
  const anybodyWaiting = places.length > 0;
  const freeNumber = proposal?.customerNumber ?? null;

  const filtered = activeFilters(filters, search);
  // "Nothing is filtered" is the plain /kunden URL: the archived clause is always in `filtered`, so
  // it alone must not make the register look filtered.
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
        // Both halves required: a free number with nobody waiting is not news, and a queue with no
        // number to give out is what the badge already states plainly (US-18.2).
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
            <>
              {/* What the table below is showing, whenever it is not everything. Between the
                  controls that caused it and the rows it describes, and muted rather than an
                  alert — a filter is not a fault (guide §5).

                  Absent, rather than reading "nichts gefiltert", on the plain register: the line's
                  being there at all is what answers "was this list filtered?", which is the
                  question a full table and a filtered one gave the same answer to. The empty branch
                  says nothing here because it states these same clauses itself. */}
              {unfiltered ? null : (
                <p
                  data-testid="customer-list-filters"
                  // Weight and not colour: the checkbox's hint sits directly above, muted and
                  // smaller, and colour would make a filter look like a fault.
                  className="text-sm font-medium text-muted-foreground"
                >
                  {de.customerList.filterSummary(filtered.join(", "))}
                </p>
              )}
              <CustomerTable rows={view.rows} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
