"use client";

/**
 * The household editor on the customer record (tasks/prd-us-16-maintain-customer-record.md §US-16.1,
 * §US-16.5) — where a baby is added and somebody who moved out is taken off the list.
 *
 * A client component for the reason the registration form is one: the counts, the portions and the
 * price have to update *as staff type*, because the whole point of the screen is that the
 * consequences of an edit are visible before it is saved (FR-1). None of the four is computed here —
 * the panel calls the same domain rules the save will apply (`composition`, `portionsFor`,
 * `priceFor`) against the day and the policy values the server handed it, so what is on screen is
 * what the save derives. There is no input for any of them by design.
 *
 * The edit is a **replacement of the whole set**, not an add-and-remove pair: staff correct the list
 * in front of them and press save. Two members can share a name and a birthdate, so a row has no
 * identity to diff on — which is also why rows are addressed by position here.
 *
 * The customer is one of these rows, and their name is on the record twice; the editor does not
 * single that row out. Correcting the customer's own name belongs to the personal-data form, which
 * carries the change into their household row in the same write (`replaceHouseholdMember`).
 */

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseCalendarDay } from "@/domain/calendarDay";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ageInYears, composition } from "@/domain/customer/householdComposition";
import { formatEuros } from "@/domain/money";
import { portionsFor, type PortionValues } from "@/domain/policy/portions";
import { priceFor, type PriceValues } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { Stat } from "../../stat";
import { updateHouseholdAction } from "./actions";
import { FormFooter, SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

/** A household row as the form holds it: the raw strings, exactly as they were typed. */
export interface MemberRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
}

const EMPTY_ROW: MemberRow = { firstName: "", lastName: "", birthDate: "" };

/** The four per-head policy values the panel derives its figures from — nothing else is needed. */
export type AllowanceValues = PortionValues & PriceValues;

/**
 * A row's birthdate as a `Date`, or `null` while it is still being typed.
 *
 * The parser's refusal is the ordinary case here rather than an error: this runs on every keystroke,
 * and `11.0` is not a day yet. Reading it the same way the server will is the point — the panel and
 * the save must not disagree about the same text (ADR-013).
 */
function typedDay(value: string): Date | null {
  try {
    return parseCalendarDay(value);
  } catch {
    return null;
  }
}

/**
 * What the household comes to under today's policy, or `null` while it cannot be derived — nobody
 * dated yet, or a date in the future. The save is what reports that as an error; the panel simply
 * has nothing to show, rather than flickering between wrong answers as a date is typed.
 */
function derived(
  rows: ReadonlyArray<MemberRow>,
  today: Date,
  policy: AllowanceValues,
): { grownUps: number; children: number; portions: number; priceCents: number } | null {
  const members = rows
    .map((row) => typedDay(row.birthDate))
    .filter((day): day is Date => day !== null)
    .map((birthDate) => ({ birthDate }));
  if (members.length === 0) {
    return null;
  }
  try {
    const counts = composition(members, today);
    return {
      ...counts,
      portions: portionsFor(counts, policy),
      priceCents: priceFor(policy, counts.grownUps, counts.children),
    };
  } catch {
    return null;
  }
}

export function HouseholdEditor({
  customerId,
  members,
  today,
  policy,
}: {
  customerId: number;
  /** The household as it stands, each birthdate already written as ISO by the server. */
  members: ReadonlyArray<MemberRow>;
  /** The day the counts are judged against — the server's, never the browser's clock. */
  today: Date;
  policy: AllowanceValues;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    updateHouseholdAction,
    initialRecordFormState,
  );
  const [rows, setRows] = useState<ReadonlyArray<MemberRow>>(members);

  const figures = derived(rows, today, policy);
  const unknown = de.customers.derived.unknown;

  function updateRow(index: number, patch: Partial<MemberRow>): void {
    setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />

      {/* The four figures the household section exists to produce, at the rank the counter gives
          them: FR-1 is that the consequences of an edit are visible before it is saved, and as four
          408px bordered boxes holding one digit each they were the least emphatic thing in the
          section. Above the table, so an edit and its consequence are read in that order. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={de.customers.derived.grownUps}
          value={figures === null ? unknown : String(figures.grownUps)}
          testId="grown-ups"
        />
        <Stat
          label={de.customers.derived.children}
          value={figures === null ? unknown : String(figures.children)}
          testId="children"
        />
        <Stat
          label={de.customers.derived.portions}
          value={figures === null ? unknown : String(figures.portions)}
          testId="portions"
        />
        <Stat
          label={de.customers.derived.price}
          value={figures === null ? unknown : formatEuros(figures.priceCents)}
          testId="price"
        />
      </div>

      {/* Tabular data, and a table: as a list of labelled grids the row identity lived inside the
          first field's label ("Haushaltsmitglied 3 — Vorname"), which wrapped in its column and
          started that input 20px below its neighbours — six ragged baselines on a six-member
          household. The age gets a column of its own for the same reason: jammed into the birthdate
          label it made the third column's heading differ on every row. */}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">{de.customers.new.memberNumberColumn}</TableHead>
            <TableHead>{de.customers.fields.firstName}</TableHead>
            <TableHead>{de.customers.fields.lastName}</TableHead>
            <TableHead>{de.customers.fields.birthDate}</TableHead>
            <TableHead className="whitespace-nowrap">{de.customers.record.ageColumn}</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const day = typedDay(row.birthDate);
            return (
              // Rows are addressed by position: two members can share a name and a birthdate, and a
              // row has no identity of its own.
              <TableRow key={index} data-testid="household-member" className="hover:bg-transparent">
                <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                {/* Each input keeps the string its visible label used to carry as `aria-label`: a
                    column heading names a column, not a cell. */}
                <TableCell>
                  <Input
                    type="text"
                    name="memberFirstName"
                    data-testid={`member-first-name-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.firstName}`}
                    value={row.firstName}
                    onChange={(event) => updateRow(index, { firstName: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="text"
                    name="memberLastName"
                    data-testid={`member-last-name-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.lastName}`}
                    value={row.lastName}
                    onChange={(event) => updateRow(index, { lastName: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <DateInput
                    name="memberBirthDate"
                    data-testid={`member-birth-date-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.birthDate}`}
                    placeholder={de.day.placeholder}
                    value={row.birthDate}
                    onChange={(birthDate) => updateRow(index, { birthDate })}
                  />
                </TableCell>
                {/* Derived from the date in the field beside it, so the 13-year boundary follows a
                    correction immediately and a reissue can be anticipated (PRD §6). */}
                <TableCell className="whitespace-nowrap tabular-nums">
                  {day === null ? "—" : de.customers.card.memberAge(ageInYears(day, today))}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`remove-member-${index}`}
                    onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                  >
                    {de.customers.new.removeMember}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-member"
          onClick={() => setRows([...rows, EMPTY_ROW])}
        >
          {de.customers.new.addMember}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{de.customers.derived.hint}</p>
      <p className="text-xs text-muted-foreground">{de.customers.derived.standardValues}</p>

      <FormFooter>
        <p className="max-w-prose text-sm text-muted-foreground">
          {de.customers.record.householdHint}
        </p>
        <SaveButton
          label={de.customers.record.householdSubmit}
          pending={pending}
          testId="household-submit"
        />
        <SaveFeedback state={state} testId="household" />
      </FormFooter>
    </form>
  );
}
