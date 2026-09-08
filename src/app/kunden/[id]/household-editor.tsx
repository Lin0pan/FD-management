"use client";

/**
 * The household editor on the customer record (tasks/prd-us-16-maintain-customer-record.md §US-16.1,
 * §US-16.5) — where a baby is added and somebody who moved out is taken off the list.
 *
 * A client component for the reason the registration form is one: the counts, the eggs and the price
 * have to update *as staff type*, because the whole point of the screen is that the consequences of
 * an edit are visible before it is saved (FR-1). None of the four is computed here — the panel calls
 * the same domain rules the save will apply (`composition`, `priceFor`, `eggsFor`) against the day
 * and the policy values the server handed it, so what is on screen is what the save derives. There
 * is no input for any of them by design.
 *
 * The edit is a **replacement of the whole set**, not an add-and-remove pair: staff correct the list
 * in front of them and press save. Two members can share a name and a birthdate, so a row has no
 * identity to diff on — which is also why rows are addressed by position here.
 *
 * The customer is one of these rows, and their name is on the record twice. That row is locked:
 * its remove control is greyed and its three fields are read-only, because a household the customer
 * is not in is one the save refuses (`createHouseholdMembers`) — better to say so before the click
 * than after it. Correcting the customer's own name belongs to the personal-data form, which
 * carries the change into their household row in the same write (`replaceHouseholdMember`).
 */

import { useActionState, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
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
import { eggsFor } from "@/domain/policy/eggs";
import { priceFor, type AllowanceValues } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { guardEnter } from "../../enter-guard";
import { useFocusFirstRefusal } from "../../field-mark";
import { marking, MEMBER_INPUT, memberPath, problemAt, type MemberPart } from "../../field-refusal";
import { Stat } from "../../stat";
import { EMPTY_ROW, isCustomerRow, type MemberRow, ROW_TEXT } from "../household-row";
import { updateHouseholdAction } from "./actions";
import { FormFooter, RecordRejection, SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

/**
 * A row's birthdate as a `Date`, or `null` while it is still being typed — a refusal is the ordinary
 * case here, this running on every keystroke. Read the way the server will read it, so the panel and
 * the save cannot disagree about the same text (ADR-013).
 */
function typedDay(value: string): Date | null {
  try {
    return parseCalendarDay(value);
  } catch {
    return null;
  }
}

/**
 * What the household comes to under today's policy, or `null` while it cannot be derived. The save
 * reports that as an error; the panel shows nothing rather than flickering between wrong answers.
 */
function derived(
  rows: ReadonlyArray<MemberRow>,
  today: Date,
  policy: AllowanceValues,
): { grownUps: number; children: number; priceCents: number; eggs: number } | null {
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
      priceCents: priceFor(policy, counts.grownUps, counts.children),
      // Through `eggsFor` against the rule the server handed down, never a lookup written out again:
      // a second reading of the staircase is how the preview and the save come to disagree. The rule
      // counts heads, so it takes the two counts added (US-28).
      eggs: eggsFor(policy.eggRule, counts.grownUps + counts.children),
    };
  } catch {
    return null;
  }
}

/**
 * One cell of the household table: the control, and the mark under it when the field was refused.
 *
 * The names are said once in the column headings, but a heading names a column and not a cell — so
 * each input carries the same string as `aria-label`.
 *
 * Top-aligned, because a mark makes one cell taller and the controls of a refused row would otherwise
 * sit at three heights. That is why the row number and the age wear `ROW_TEXT`: top-aligning takes
 * away the centring a `TableCell` does for itself.
 *
 * `name` and the path come from `field-refusal.ts`, because the registration's table submits the same
 * three inputs — a second spelling is how a refusal marks the right row on one screen and no row on
 * the other, with nothing failing.
 */
function MemberCell({
  index,
  part,
  testId,
  value,
  onChange,
  problem,
  readOnly = false,
}: {
  index: number;
  part: MemberPart;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
  /**
   * `readOnly`, never `disabled`: a disabled input submits nothing, and the columns are read back as
   * parallel lists paired by position — a dropped value would shift every row below it.
   */
  readOnly?: boolean;
}): React.ReactElement {
  const name = MEMBER_INPUT[part];
  // Not `useId`: the mark's `aria-describedby` has to name an element, and a stable id per row and
  // part is readable in a snapshot and unique on a page carrying one of these tables.
  const id = `record-${name}-${index}`;
  const label = `${de.customers.new.memberRow(index + 1)} — ${de.customers.fields[part]}`;
  const marks = marking(memberPath(index, part), id, problem);
  const quiet = readOnly ? "bg-muted text-muted-foreground" : undefined;

  return (
    <TableCell className="align-top">
      <div className="flex flex-col gap-1">
        {part === "birthDate" ? (
          <DateInput
            name={name}
            id={id}
            data-testid={testId}
            aria-label={label}
            placeholder={de.day.placeholder}
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            className={quiet}
            {...marks}
          />
        ) : (
          <Input
            type="text"
            name={name}
            id={id}
            data-testid={testId}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            readOnly={readOnly}
            className={quiet}
            {...marks}
          />
        )}
        {problem === null ? null : <RecordRejection id={id} problem={problem} />}
      </div>
    </TableCell>
  );
}

/**
 * The household as a value, so a new one can be told from a re-render of the same one: `members`
 * arrives freshly mapped every time, so only what the rows *say* answers "did the record change?".
 */
function householdKey(members: ReadonlyArray<MemberRow>): string {
  return JSON.stringify(members.map((row) => [row.firstName, row.lastName, row.birthDate]));
}

export function HouseholdEditor({
  customerId,
  customer,
  members,
  today,
  policy,
}: {
  customerId: number;
  /** Who the record is about, written as a row, so `isCustomerRow` can pick theirs out by what it says. */
  customer: MemberRow;
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
  const [shown, setShown] = useState(() => householdKey(members));
  const form = useRef<HTMLFormElement>(null);

  // The record can be rewritten *under* this table: correcting the customer's name on the form above
  // carries into their household row in the same write (`replaceHouseholdMember`). The rows are
  // editable state seeded from the props, so without this the customer's row would stop looking like
  // theirs, unlock itself, and a save would post a household the record no longer describes.
  const stored = householdKey(members);
  if (stored !== shown) {
    setShown(stored);
    setRows(members);
  }

  const figures = derived(rows, today, policy);
  const unknown = de.customers.derived.unknown;

  const fields = state.status === "error" ? state.fields : undefined;
  const problem = (path: string): string | null => problemAt(fields, path);
  // Scoped to this form: the record renders eight on one page, and a refusal here must not put the
  // cursor in another form's control.
  useFocusFirstRefusal(fields, form);

  function updateRow(index: number, patch: Partial<MemberRow>): void {
    setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <form ref={form} action={formAction} onKeyDown={guardEnter} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />

      {/* The four figures the household section exists to produce, at the rank the counter gives
          them: FR-1 is that the consequences of an edit are visible before it is saved, and as
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
        {/* Third, ahead of the price, as at the counter and on the read-only block above.

            The dash is the *nothing derivable at all* state — no dated member yet — and it stays
            that for the eggs exactly as it is for the counts beside them. An entitlement of none is
            a different answer and reads 0: a household of two is known and small, not unknown. */}
        <Stat
          label={de.customers.derived.eggs}
          value={figures === null ? unknown : String(figures.eggs)}
          testId="eggs"
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
            // Theirs by what it says, which is how the save finds it too — so what is locked here is
            // exactly what the domain would refuse to lose.
            const isCustomer = isCustomerRow(row, customer);
            return (
              // Addressed by position: two members can share a name and a birthdate.
              <TableRow key={index} data-testid="household-member" className="hover:bg-transparent">
                <TableCell className="align-top text-muted-foreground tabular-nums">
                  <div className={ROW_TEXT}>{index + 1}</div>
                </TableCell>
                <MemberCell
                  index={index}
                  part="firstName"
                  testId={`member-first-name-${index}`}
                  value={row.firstName}
                  onChange={(firstName) => updateRow(index, { firstName })}
                  problem={problem(memberPath(index, "firstName"))}
                  readOnly={isCustomer}
                />
                <MemberCell
                  index={index}
                  part="lastName"
                  testId={`member-last-name-${index}`}
                  value={row.lastName}
                  onChange={(lastName) => updateRow(index, { lastName })}
                  problem={problem(memberPath(index, "lastName"))}
                  readOnly={isCustomer}
                />
                <MemberCell
                  index={index}
                  part="birthDate"
                  testId={`member-birth-date-${index}`}
                  value={row.birthDate}
                  onChange={(birthDate) => updateRow(index, { birthDate })}
                  problem={problem(memberPath(index, "birthDate"))}
                  readOnly={isCustomer}
                />
                {/* Derived from the date in the field beside it, so the 13-year boundary follows a
                    correction immediately and a reissue can be anticipated (PRD §6). */}
                <TableCell className="align-top whitespace-nowrap tabular-nums">
                  <div className={ROW_TEXT}>
                    {day === null ? "—" : de.customers.card.memberAge(ageInYears(day, today))}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  {/* The label moves to `aria-label` rather than going: this column's `<TableHead>`
                      is empty by design, so the label is the control's only name (§9). Three of
                      these stack in a household of four, and the repetition was the noise rather
                      than the words. `X` and not `Trash` — nothing is deleted until the save.

                      §6's exception is untouched: on the customer's own row the control stays
                      rendered and `disabled`, because a cell that empties itself reads as a
                      rendering fault and shifts the rows below under the hand reaching for them. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={de.customers.new.removeMember}
                    data-testid={`remove-member-${index}`}
                    disabled={isCustomer}
                    onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div>
        {/* Solitary rather than repeated, so it keeps its words. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-member"
          onClick={() => setRows([...rows, EMPTY_ROW])}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {de.customers.new.addMember}
        </Button>
      </div>

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
