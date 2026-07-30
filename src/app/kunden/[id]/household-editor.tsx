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
import { ageInYears, composition } from "@/domain/customer/householdComposition";
import { formatEuros } from "@/domain/money";
import { portionsFor, type PortionValues } from "@/domain/policy/portions";
import { priceFor, type PriceValues } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { updateHouseholdAction } from "./actions";
import { fieldClass, SaveButton, SaveFeedback } from "./record-forms";
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

/** A row's birthdate as a `Date`, or `null` while it is still being typed. */
function typedDay(value: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
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

/** One derived figure, in the same box the read-only record shows it in. */
function Derived({
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
      <span data-testid={testId} className="font-semibold tabular-nums">
        {value}
      </span>
    </p>
  );
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

      <ul className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const day = typedDay(row.birthDate);
          return (
            // Rows are addressed by position: two members can share a name and a birthdate, and a
            // row has no identity of its own.
            <li key={index} data-testid="household-member" className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">
                  {de.customers.new.memberRow(index + 1)} — {de.customers.fields.firstName}
                </span>
                <input
                  className={fieldClass}
                  type="text"
                  name="memberFirstName"
                  data-testid={`member-first-name-${index}`}
                  value={row.firstName}
                  onChange={(event) => updateRow(index, { firstName: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">{de.customers.fields.lastName}</span>
                <input
                  className={fieldClass}
                  type="text"
                  name="memberLastName"
                  data-testid={`member-last-name-${index}`}
                  value={row.lastName}
                  onChange={(event) => updateRow(index, { lastName: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                {/* The age beside the birthdate, so the 13-year boundary is legible and a reissue
                    can be anticipated rather than discovered (PRD §6). It is derived from the date
                    in the field, so it follows a correction immediately. */}
                <span className="text-sm text-foreground/70">
                  {de.customers.fields.birthDate}
                  {day === null ? "" : ` (${de.customers.card.memberAge(ageInYears(day, today))})`}
                </span>
                <input
                  className={fieldClass}
                  type="date"
                  name="memberBirthDate"
                  data-testid={`member-birth-date-${index}`}
                  value={row.birthDate}
                  onChange={(event) => updateRow(index, { birthDate: event.target.value })}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  data-testid={`remove-member-${index}`}
                  onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                  className="rounded border border-foreground/20 px-3 py-1 text-sm"
                >
                  {de.customers.new.removeMember}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <button
          type="button"
          data-testid="add-member"
          onClick={() => setRows([...rows, EMPTY_ROW])}
          className="rounded border border-foreground/20 px-3 py-1 text-sm"
        >
          {de.customers.new.addMember}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Derived
          label={de.customers.derived.grownUps}
          value={figures === null ? unknown : String(figures.grownUps)}
          testId="grown-ups"
        />
        <Derived
          label={de.customers.derived.children}
          value={figures === null ? unknown : String(figures.children)}
          testId="children"
        />
        <Derived
          label={de.customers.derived.portions}
          value={figures === null ? unknown : String(figures.portions)}
          testId="portions"
        />
        <Derived
          label={de.customers.derived.price}
          value={figures === null ? unknown : formatEuros(figures.priceCents)}
          testId="price"
        />
      </div>
      <p className="text-xs text-foreground/60">{de.customers.derived.hint}</p>
      <p className="text-xs text-foreground/60">{de.customers.derived.standardValues}</p>
      <p className="max-w-prose text-sm text-foreground/70">{de.customers.record.householdHint}</p>

      <SaveButton
        label={de.customers.record.householdSubmit}
        pending={pending}
        testId="household-submit"
      />
      <SaveFeedback state={state} testId="household" />
    </form>
  );
}
