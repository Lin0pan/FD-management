"use client";

/**
 * The registration form.
 *
 * A client component for two reasons: `useActionState` reports a rejection back into the page, and
 * the household counts have to update *as staff type*. Those counts are not computed here — the form
 * calls the domain rule (`composition`) against the day the server handed it, so the number on
 * screen is the same number the save will derive. There is no input for them by design.
 *
 * The form holds no other rules. Which number, which group and whether the household holds together
 * are all decided behind `registerCustomer`.
 *
 * It may arrive pre-filled — from an archived record (US-11.4) or from a waiting-list entry
 * (US-12.4). The draft is read once, as the initial value of every field: the screen remounts the
 * form when the selection changes, so there is no second source of truth to keep in step, and every
 * pre-filled field is as editable as one that was typed. Neither draft carries a number or a group,
 * because those are decided afresh; whether it carries a certificate is the one honest difference
 * between them, and `PrefillDraft` says why.
 *
 * The action it submits to is a prop for the same reason the parsing is shared: a promotion off the
 * waiting list must register *and* clear the entry, in that order, and that pairing belongs in a use
 * case rather than in whichever screen remembers to do both.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import type { RegistrationProposal } from "@/application/customers/propose-registration";
import { composition } from "@/domain/customer/householdComposition";
import { GROUPS } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { submitRegistration } from "./actions";
import type { PrefillDraft } from "./archive-search-state";
import {
  initialRegisterCustomerState,
  type RegisterCustomerState,
} from "./register-customer-state";

const fieldClass = "w-full rounded border border-foreground/20 bg-transparent px-2 py-1";

/** A household row as the form holds it: the raw strings, exactly as they were typed. */
interface MemberRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
}

const EMPTY_ROW: MemberRow = { firstName: "", lastName: "", birthDate: "" };

/**
 * The rows the counts can be derived from, as `Date`s.
 *
 * A row that is still being typed has no birthdate yet; counting it as anything would make the
 * display flicker between wrong answers, so it simply does not count until a date is there.
 */
function datedMembers(rows: ReadonlyArray<MemberRow>): Array<{ birthDate: Date }> {
  return rows
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.birthDate))
    .map((row) => ({ birthDate: new Date(`${row.birthDate}T00:00:00.000Z`) }));
}

/**
 * The derived split of the household as it stands, or `null` while it cannot be derived — nobody
 * dated yet, or a date in the future. The save is what reports that as an error; the panel just
 * has nothing to show.
 */
function derivedCounts(
  rows: ReadonlyArray<MemberRow>,
  today: Date,
): { grownUps: number; children: number } | null {
  const members = datedMembers(rows);
  if (members.length === 0) {
    return null;
  }
  try {
    return composition(members, today);
  } catch {
    return null;
  }
}

function TextField({
  name,
  label,
  value,
  onChange,
  type = "text",
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input
        className={fieldClass}
        type={type}
        name={name}
        id={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** The household as the form starts out: the archived one if there is a draft, otherwise one blank row. */
function initialRows(draft: PrefillDraft | null): ReadonlyArray<MemberRow> {
  return draft === null ? [EMPTY_ROW] : draft.householdMembers.map((member) => ({ ...member }));
}

export function RegistrationForm({
  proposal,
  draft = null,
  previousCustomerId = null,
  entryId = null,
  submit = submitRegistration,
}: {
  proposal: RegistrationProposal;
  /** The household this form was filled from, or `null` for a walk-in registration. */
  draft?: PrefillDraft | null;
  /**
   * The archived record the draft came from, carried through to `registerCustomer` as display
   * metadata. No rule reads it — it is how a later screen can say why two records name the same
   * people (tasks/prd-us-11-reuse-archived-record.md §FR-5).
   */
  previousCustomerId?: number | null;
  /**
   * The waiting-list entry this registration would fill (US-12.4). Unlike `previousCustomerId` it is
   * acted on: the use case behind `submit` takes the applicant off the list once — and only once —
   * the registration has landed.
   */
  entryId?: number | null;
  /** Where the form is saved. The default is the ordinary walk-in registration. */
  submit?: (previous: RegisterCustomerState, formData: FormData) => Promise<RegisterCustomerState>;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(submit, initialRegisterCustomerState);

  const [firstName, setFirstName] = useState(draft?.firstName ?? "");
  const [lastName, setLastName] = useState(draft?.lastName ?? "");
  const [birthDate, setBirthDate] = useState(draft?.birthDate ?? "");
  const [rows, setRows] = useState<ReadonlyArray<MemberRow>>(initialRows(draft));
  // The first row mirrors the personal data until somebody edits it by hand: the registered person
  // *is* a household member, and typing their name twice is how a household ends up with a phantom
  // extra head. Once the row has been touched, it is theirs to keep.
  //
  // A pre-filled form never mirrors: the rows are the household as the archived record listed it,
  // and there is no promise that the applicant is the first of them. Overwriting row one with the
  // personal data would then drop a member and duplicate another.
  const [mirrorFirstRow, setMirrorFirstRow] = useState(draft === null);

  const members: ReadonlyArray<MemberRow> =
    mirrorFirstRow && rows.length > 0
      ? [{ firstName, lastName, birthDate }, ...rows.slice(1)]
      : rows;

  const counts = derivedCounts(members, proposal.today);
  const full = proposal.customerNumber === null;

  function updateRow(index: number, patch: Partial<MemberRow>): void {
    if (index === 0) {
      setMirrorFirstRow(false);
    }
    setRows(
      members.map((row, position) => (position === index ? { ...row, ...patch } : { ...row })),
    );
  }

  function removeRow(index: number): void {
    setMirrorFirstRow(false);
    setRows(members.filter((_row, position) => position !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {/* Absent rather than empty for a walk-in: the field is metadata about where these people
          came from, and a blank string is not an answer to that. */}
      {previousCustomerId === null ? null : (
        <input type="hidden" name="previousCustomerId" value={previousCustomerId} />
      )}
      {entryId === null ? null : <input type="hidden" name="entryId" value={entryId} />}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.new.personalHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="firstName"
            label={de.customers.fields.firstName}
            value={firstName}
            onChange={setFirstName}
          />
          <TextField
            name="lastName"
            label={de.customers.fields.lastName}
            value={lastName}
            onChange={setLastName}
          />
          <TextField
            name="birthDate"
            label={de.customers.fields.birthDate}
            value={birthDate}
            onChange={setBirthDate}
            type="date"
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.customers.fields.notes}</span>
            <input
              className={fieldClass}
              type="text"
              name="notes"
              id="notes"
              defaultValue={draft?.notes ?? ""}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.new.addressHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.customers.fields.street}</span>
            <input
              className={fieldClass}
              type="text"
              name="street"
              id="street"
              defaultValue={draft?.street ?? ""}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.customers.fields.houseNumber}</span>
            <input
              className={fieldClass}
              type="text"
              name="houseNumber"
              id="houseNumber"
              defaultValue={draft?.houseNumber ?? ""}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.customers.fields.zip}</span>
            <input
              className={fieldClass}
              type="text"
              name="zip"
              id="zip"
              defaultValue={draft?.zip ?? ""}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.customers.fields.city}</span>
            <input
              className={fieldClass}
              type="text"
              name="city"
              id="city"
              defaultValue={draft?.city ?? ""}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.new.certificateHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">
              {de.customers.fields.certificateType}
            </span>
            <input
              className={fieldClass}
              type="text"
              name="certificateType"
              id="certificateType"
              defaultValue={draft?.certificateType ?? ""}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">
              {de.customers.fields.certificateValidUntil}
            </span>
            <input
              className={fieldClass}
              type="date"
              name="certificateValidUntil"
              id="certificateValidUntil"
              defaultValue={draft?.certificateValidUntil ?? ""}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.new.householdHeading}</h2>
        <p className="max-w-prose text-sm text-foreground/70">{de.customers.new.householdHint}</p>

        <ul className="flex flex-col gap-4">
          {members.map((row, index) => (
            // Rows are addressed by position: two members can share a name and a birthdate, and a
            // row has no identity of its own until it is saved.
            <li key={index} data-testid="household-row" className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">
                  {de.customers.new.memberRow(index + 1)} — {de.customers.fields.firstName}
                </span>
                <input
                  className={fieldClass}
                  type="text"
                  name="memberFirstName"
                  id={`memberFirstName-${index}`}
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
                  id={`memberLastName-${index}`}
                  value={row.lastName}
                  onChange={(event) => updateRow(index, { lastName: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">{de.customers.fields.birthDate}</span>
                <input
                  className={fieldClass}
                  type="date"
                  name="memberBirthDate"
                  id={`memberBirthDate-${index}`}
                  value={row.birthDate}
                  onChange={(event) => updateRow(index, { birthDate: event.target.value })}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  data-testid={`remove-member-${index}`}
                  onClick={() => removeRow(index)}
                  className="rounded border border-foreground/20 px-3 py-1 text-sm"
                >
                  {de.customers.new.removeMember}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div>
          <button
            type="button"
            data-testid="add-member"
            onClick={() => setRows([...members, EMPTY_ROW])}
            className="rounded border border-foreground/20 px-3 py-1 text-sm"
          >
            {de.customers.new.addMember}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.derived.grownUps}: </span>
            <span data-testid="grown-ups" className="font-semibold tabular-nums">
              {counts === null ? de.customers.derived.unknown : counts.grownUps}
            </span>
          </p>
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.derived.children}: </span>
            <span data-testid="children" className="font-semibold tabular-nums">
              {counts === null ? de.customers.derived.unknown : counts.children}
            </span>
          </p>
        </div>
        <p className="text-xs text-foreground/60">{de.customers.derived.hint}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.new.assignmentHeading}</h2>
        <p className="rounded border border-foreground/15 px-3 py-2">
          <span className="text-sm text-foreground/70">
            {de.customers.assignment.proposedNumber}:{" "}
          </span>
          <span data-testid="proposed-number" className="font-semibold tabular-nums">
            {proposal.customerNumber ?? de.customers.derived.unknown}
          </span>
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-foreground/70">{de.customers.fields.group}</legend>
          <div className="flex gap-4">
            {GROUPS.map((group) => (
              <label key={group} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="group"
                  id={`group-${group}`}
                  value={group}
                  defaultChecked={group === proposal.suggestedGroup}
                />
                <span>{de.customers.groups[group]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-foreground/60">
            {de.customers.assignment.suggestedGroup(de.customers.groups[proposal.suggestedGroup])} ·{" "}
            {de.customers.assignment.groupSizes(
              proposal.groupCounts.red,
              proposal.groupCounts.blue,
            )}
          </p>
        </fieldset>

        {/* A full register is not a dead end. Turning an applicant away is precisely what the
            waiting list exists to prevent (US-12, FR-3), so the way onto it is offered here rather
            than left for staff to find. */}
        {full ? (
          <div
            role="status"
            data-testid="registration-error"
            className="flex max-w-prose flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            <p>{de.customers.errors.noFreeCustomerNumber(proposal.quotaN)}</p>
            <Link
              href="/warteliste"
              data-testid="registration-waiting-list-link"
              className="self-start underline underline-offset-4"
            >
              {de.customers.new.waitingListLink}
            </Link>
          </div>
        ) : null}

        {state.status === "error" && state.message !== undefined ? (
          <p
            role="status"
            data-testid="registration-error"
            className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            {state.message}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={pending || full}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
          >
            {pending ? de.customers.new.submitting : de.customers.new.submit}
          </button>
        </div>
      </section>
    </form>
  );
}
