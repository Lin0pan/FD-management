/**
 * The Kundenliste's nine columns, shared by `/kunden` and the household list under the counter's mask
 * (US-41.8) — one component, so the two lists cannot come to show one household differently. Each
 * screen owns its `<tr>` and whatever columns it adds; only where the name links to differs.
 */

import Link from "next/link";
import type { CustomerListRow } from "@/application/customers/list-customers";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableHead } from "@/components/ui/table";
import type { CertificateState } from "@/domain/customer/certificate";
import { formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { GROUP_STYLES } from "../accents";
import { STATUS_CHROME, StateWord, type Chrome } from "./state-word";

/** The chrome for a certificate state — `null` for the one that is simply normal. */
export const CERTIFICATE_CHROME: Record<CertificateState, Chrome | null> = {
  VALID: null,
  EXPIRING_SOON: { variant: "outline", className: "border-amber-500 bg-amber-100 text-amber-900" },
  EXPIRED: { variant: "outline", className: "border-red-400 bg-red-100 text-red-800" },
};

export function CustomerHeads(): React.ReactElement {
  return (
    <>
      <TableHead className="text-right">{de.customerList.table.customerNumber}</TableHead>
      <TableHead>{de.customerList.table.name}</TableHead>
      <TableHead>{de.customerList.table.cardNumber}</TableHead>
      <TableHead>{de.customerList.table.group}</TableHead>
      <TableHead>{de.customerList.table.status}</TableHead>
      <TableHead className="text-right">{de.customerList.table.household}</TableHead>
      <TableHead className="text-right">{de.customerList.table.price}</TableHead>
      <TableHead>{de.customerList.table.certificate}</TableHead>
      <TableHead className="text-right">{de.customerList.table.reminders}</TableHead>
    </>
  );
}

/** Where the name leads: the record on `/kunden`, the household's lookup at the counter. */
export interface NameLink {
  readonly href: string;
  readonly testId: string;
}

export function CustomerCells({
  row,
  link,
}: {
  row: CustomerListRow;
  link: NameLink;
}): React.ReactElement {
  return (
    <>
      <TableCell data-testid="customer-row-number" className="text-right tabular-nums">
        {row.customerNumber}
      </TableCell>
      {/* `min-w-48`: the widest this column can be while nine columns at the theme's cell size
          still fit a 1100px window (`tests/e2e/layout.ts`). This is the column staff scan, and the only one holding text long enough to need a ceiling as well as
          a floor — the same `48`, so the column is a fixed width and the table cannot be widened by
          what a household happens to be called (`docs/guideline/ui_styling_guide.md` §3). The cap is
          on the link rather than the cell: in an auto-layout table it is the inner box's max-width
          that clamps the column's min-content contribution. */}
      <TableCell className="min-w-48">
        {/* Underlined on hover rather than always: 240 permanent underlines is 240 pieces of noise,
            and the whole row lights up under the cursor anyway. */}
        <Link
          href={link.href}
          data-testid={link.testId}
          title={`${row.lastName}, ${row.firstName}`}
          className="block max-w-48 truncate font-semibold underline-offset-4 hover:underline"
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
    </>
  );
}
