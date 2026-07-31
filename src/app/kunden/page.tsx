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
 * URL (FR-5). That is not a technicality — FD share one machine, and "the list I was looking at" has
 * to survive a reload and be passable to a colleague as a link.
 *
 * The group balance stands above the table and deliberately does not move with the filters: it is
 * the number staff assign a new household's group by (US-01), and it counts every active household
 * whatever is currently on screen.
 */

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
import { EXPIRING_SOON_DAYS, type CertificateState } from "@/domain/customer/certificate";
import type { CustomerStatus } from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import { DomainError } from "@/domain/errors";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { waitingListDeps } from "../warteliste/deps";
import { customerDeps } from "./deps";

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

/** The group's colour, matching the counter and the customer card so they read as the same thing. */
const GROUP_STYLES: Record<Group, string> = {
  RED: "border-red-600/40 bg-red-600/10",
  BLUE: "border-blue-700/40 bg-blue-700/10",
};

/** Status colours. They only ever repeat the word in the same cell — never a badge without text. */
const STATUS_STYLES: Record<CustomerStatus, string> = {
  ACTIVE: "border-emerald-600/40 bg-emerald-600/10",
  BLOCKED: "border-red-500/40 bg-red-500/10",
  ARCHIVED: "border-foreground/25 bg-foreground/10",
};

const CERTIFICATE_STYLES: Record<CertificateState, string> = {
  VALID: "border-transparent",
  EXPIRING_SOON: "border-amber-500/40 bg-amber-500/10",
  EXPIRED: "border-red-500/40 bg-red-500/10",
};

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

function Badge({
  label,
  style,
  testId,
}: {
  label: string;
  style: string;
  testId: string;
}): React.ReactElement {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded border px-2 py-0.5 text-sm whitespace-nowrap ${style}`}
    >
      {label}
    </span>
  );
}

/** One column heading. `scope="col"` so the table reads as a table to anyone not looking at it. */
function Heading({
  label,
  numeric = false,
}: {
  label: string;
  numeric?: boolean;
}): React.ReactElement {
  return (
    <th
      scope="col"
      className={`px-2 py-2 font-semibold whitespace-nowrap ${numeric ? "text-right" : "text-left"}`}
    >
      {label}
    </th>
  );
}

function Row({ row }: { row: CustomerListRow }): React.ReactElement {
  // An archived household is dimmed *and* carries the word "archiviert" in its status cell. The
  // shading alone would be a distinction only some readers can make, and this is the one row on the
  // screen whose customer number may already belong to somebody else (US-10).
  const archived = row.status === "ARCHIVED";

  return (
    <tr
      data-testid="customer-row"
      data-customer-number={row.customerNumber}
      data-status={row.status}
      className={`border-t border-foreground/10 align-top ${archived ? "bg-foreground/5 text-foreground/60" : ""}`}
    >
      <td data-testid="customer-row-number" className="px-2 py-2 text-right tabular-nums">
        {row.customerNumber}
      </td>
      <td className="px-2 py-2">
        <Link
          href={`/kunden/${row.customerId}`}
          data-testid="customer-row-link"
          className="underline underline-offset-4"
        >
          {row.lastName}, {row.firstName}
        </Link>
      </td>
      <td data-testid="customer-row-card" className="px-2 py-2 tabular-nums">
        {row.cardNumber}
      </td>
      <td className="px-2 py-2">
        <Badge
          label={de.customers.groups[row.group]}
          style={GROUP_STYLES[row.group]}
          testId="customer-row-group"
        />
      </td>
      <td className="px-2 py-2">
        <Badge
          label={de.customers.status[row.status]}
          style={STATUS_STYLES[row.status]}
          testId="customer-row-status"
        />
      </td>
      <td data-testid="customer-row-grown-ups" className="px-2 py-2 text-right tabular-nums">
        {row.grownUps}
      </td>
      <td data-testid="customer-row-children" className="px-2 py-2 text-right tabular-nums">
        {row.children}
      </td>
      <td data-testid="customer-row-portions" className="px-2 py-2 text-right tabular-nums">
        {row.portions}
      </td>
      <td data-testid="customer-row-price" className="px-2 py-2 text-right tabular-nums">
        {formatEuros(row.priceCents)}
      </td>
      {/* The date and where it stands today, side by side: the state is what staff scan for, the
          date is what they say to the household. */}
      <td className="px-2 py-2 whitespace-nowrap">
        <span data-testid="customer-row-certificate" className="tabular-nums">
          {germanDate(row.certificateValidUntil)}
        </span>{" "}
        <Badge
          label={de.customerList.certificateStates[row.certificateState]}
          style={CERTIFICATE_STYLES[row.certificateState]}
          testId="customer-row-certificate-state"
        />
      </td>
      <td data-testid="customer-row-reminders" className="px-2 py-2 text-right tabular-nums">
        {row.reminderCount}
      </td>
    </tr>
  );
}

/**
 * The filters, as a plain GET form.
 *
 * No JavaScript is involved: submitting navigates, which is what writes the filters into the URL and
 * makes the view bookmarkable. Every control is labelled, and the unset option of each select says
 * "Alle" rather than being blank.
 */
function FilterForm({ filters, search }: { filters: Filters; search: string }): React.ReactElement {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customerList.search.label}</span>
        <input
          // Not `type="number"`: the same box takes a name and a card number's `k`.
          type="text"
          name="suche"
          data-testid="customer-search"
          placeholder={de.customerList.search.placeholder}
          defaultValue={search}
          autoComplete="off"
          className="min-w-64 rounded border border-foreground/20 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customerList.filters.status}</span>
        <select
          name="status"
          data-testid="status-filter"
          defaultValue={filters.status ?? ""}
          className="rounded border border-foreground/20 px-3 py-2"
        >
          <option value="">{de.customerList.filters.all}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {de.customers.status[status]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customerList.filters.group}</span>
        <select
          name="gruppe"
          data-testid="group-filter"
          defaultValue={filters.gruppe ?? ""}
          className="rounded border border-foreground/20 px-3 py-2"
        >
          <option value="">{de.customerList.filters.all}</option>
          {GROUP_OPTIONS.map((group) => (
            <option key={group} value={group}>
              {de.customers.groups[group]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customerList.filters.certificate}</span>
        <select
          name="nachweis"
          data-testid="certificate-filter"
          defaultValue={filters.nachweis ?? ""}
          className="rounded border border-foreground/20 px-3 py-2"
        >
          <option value="">{de.customerList.filters.all}</option>
          {CERTIFICATE_OPTIONS.map((state) => (
            <option key={state} value={state}>
              {certificateFilterLabel(state)}
            </option>
          ))}
        </select>
      </label>

      {/* Ticked deliberately, never by default (FR-4). Unticked it submits nothing at all, so the
          plain /kunden URL is the working view of who FD serves. */}
      <label className="flex items-center gap-2 py-2">
        <input
          type="checkbox"
          name="archiv"
          value="1"
          data-testid="archived-toggle"
          defaultChecked={filters.archiv === "1"}
          className="size-4"
        />
        <span>{de.customerList.filters.includeArchived}</span>
      </label>

      <button type="submit" className="rounded border border-foreground/20 px-4 py-2 font-medium">
        {de.customerList.filters.submit}
      </button>
      <Link href="/kunden" className="py-2 underline underline-offset-4">
        {de.customerList.filters.reset}
      </Link>
    </form>
  );
}

/**
 * The count pill both hub badges are made of (PRD §6). It is one component so that the two cannot
 * drift apart: they stand next to each other and are read as one row, and a pill a pixel taller than
 * its neighbour is how that stops being true. The border is always there — transparent in the
 * neutral state — so tinting one of them changes its colour and not its size.
 */
function CountBadge({
  label,
  testId,
  accent = "border-transparent",
  ...rest
}: {
  label: string;
  testId: string;
  accent?: string;
} & React.ComponentPropsWithoutRef<"span">): React.ReactElement {
  return (
    <span
      data-testid={testId}
      className={`rounded-full border bg-foreground/10 px-3 py-1 text-sm tabular-nums ${accent}`}
      {...rest}
    >
      {label}
    </span>
  );
}

/**
 * The tint the waiting-list badge wears when a customer number is actually free (US-18.2).
 *
 * It is the same subtle green the register uses for an active household, and deliberately neither
 * red nor amber: those are spoken for by a blocked status and a lapsing certificate, and a free slot
 * is not an alarm — it is the ordinary good news that somebody who has waited can now be served. The
 * tint never travels alone: `waitingListBadge` puts "Platz frei" in the badge in the same breath,
 * because a colour is a distinction only some of the staff can make (US-03.4).
 */
const FREE_SLOT_ACCENT = "border-emerald-600/40 bg-emerald-600/15";

/**
 * The three customer actions, above the list (FR-5).
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
 */
function HubActions({
  cardsDue,
  waiting,
  freeSlot,
}: {
  cardsDue: number;
  waiting: number;
  freeSlot: boolean;
}): React.ReactElement {
  return (
    <section data-testid="customer-actions" className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Link
        href="/kunden/neu"
        data-testid="hub-new-customer"
        className="rounded bg-foreground px-4 py-2 font-semibold text-background"
      >
        {de.customerList.actions.newCustomer}
      </Link>
      <Link href="/warteliste" data-testid="hub-waiting-list" className="flex gap-2">
        <span className="underline underline-offset-4">{de.customerList.actions.waitingList}</span>
        {/* The state is on the element as data, not only in its colour, so a spec asserts what the
            badge means rather than what shade it happens to be painted. */}
        <CountBadge
          testId="waiting-list-badge"
          data-free-slot={freeSlot ? "true" : "false"}
          accent={freeSlot ? FREE_SLOT_ACCENT : undefined}
          label={de.customerList.actions.waitingListBadge(waiting, freeSlot)}
        />
      </Link>
      <Link href="/karten-neuausstellung" data-testid="hub-cards-due" className="flex gap-2">
        <span className="underline underline-offset-4">{de.customerList.actions.cardsDue}</span>
        <CountBadge
          testId="cards-due-badge"
          label={de.customerList.actions.cardsDueBadge(cardsDue)}
        />
      </Link>
    </section>
  );
}

function Table({ rows }: { rows: ReadonlyArray<CustomerListRow> }): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table data-testid="customer-table" className="w-full border-collapse text-sm">
        {/* The header stays put while the register is scrolled — at 240 rows the columns are
            otherwise unreadable halfway down (PRD §6). */}
        <thead className="sticky top-0 bg-background">
          <tr className="border-b border-foreground/20">
            <Heading label={de.customerList.table.customerNumber} numeric />
            <Heading label={de.customerList.table.name} />
            <Heading label={de.customerList.table.cardNumber} />
            <Heading label={de.customerList.table.group} />
            <Heading label={de.customerList.table.status} />
            <Heading label={de.customerList.table.grownUps} numeric />
            <Heading label={de.customerList.table.children} numeric />
            <Heading label={de.customerList.table.portions} numeric />
            <Heading label={de.customerList.table.price} numeric />
            <Heading label={de.customerList.table.certificate} />
            <Heading label={de.customerList.table.reminders} numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.customerId} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the screen says when FD has not configured anything yet: the list cannot price a household
 * before a portion has a price (US-14). The register is not broken, the installation is unfinished,
 * so the page says so and points at the settings rather than being an error screen.
 */
function NoSettings(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.customerList.heading}</h1>
      <p className="max-w-prose">{de.settings.errors.noSettings}</p>
      <Link href="/einstellungen" className="underline underline-offset-4">
        {de.home.settingsLink}
      </Link>
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.customerList.heading}</h1>
      <p className="max-w-prose text-foreground/80">{de.customerList.intro}</p>

      {/* No banner here any more (US-18.3). Naming one applicant and one number at the top of the
          register was a decision about somebody else standing in front of the thing staff came for;
          it now stands on /kunden/neu, where the number is actually about to be handed out. What
          survives here is the badge — the same fact, stated quietly. */}
      <HubActions
        cardsDue={cardsDue}
        waiting={places.length}
        // Both halves are required: a free number with nobody waiting is not news, and a queue with
        // no number to give out is the state the badge already states plainly (US-18.2).
        freeSlot={anybodyWaiting && freeNumber !== null}
      />

      {/* Above the filters, because it is the one number on this screen that the filters do not
          touch — and the one staff came for when they are registering somebody (FR-3). */}
      <section className="flex flex-col gap-1">
        <p
          data-testid="group-counts"
          data-red={view.groupCounts.red}
          data-blue={view.groupCounts.blue}
          className="text-2xl font-semibold"
        >
          {de.customerList.groupBalance(view.groupCounts.red, view.groupCounts.blue)}
        </p>
        <p className="max-w-prose text-sm text-foreground/70">{de.customerList.groupBalanceHint}</p>
      </section>

      <FilterForm filters={filters} search={search} />
      <p className="text-sm text-foreground/70">{de.customerList.filters.includeArchivedHint}</p>

      {view.rows.length === 0 ? (
        <p data-testid="customer-list-empty" className="max-w-prose">
          {unfiltered
            ? de.customerList.empty.unfiltered
            : de.customerList.empty.filtered(filtered.join(", "))}
        </p>
      ) : (
        <>
          <p data-testid="customer-list-count" className="text-sm text-foreground/70">
            {de.customerList.resultCount(view.rows.length)}
          </p>
          <Table rows={view.rows} />
        </>
      )}
    </main>
  );
}
