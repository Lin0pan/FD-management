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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { composition } from "@/domain/customer/householdComposition";
import { GROUPS } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { GROUP_STYLES } from "../../accents";
import { Stat } from "../../stat";
import { Notice } from "../../notice";
import { submitRegistration } from "./actions";
import type { PrefillDraft } from "./archive-search-state";
import {
  initialRegisterCustomerState,
  type RegisterCustomerState,
} from "./register-customer-state";

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

/**
 * One field of the form, in a slot of the twelve-column grid.
 *
 * The span is the point. Every field on this screen used to be 408px because all four sections
 * shared one `sm:grid-cols-2`, so `PLZ` promised as much room as `Straße` — and a field's width is
 * the most reliable hint a form has about what it wants. `<label htmlFor>` + `<Input id>` rather
 * than the old nested `<label><span>`, which worked only by nesting and left the accessibility
 * snapshot with unnamed textboxes.
 */
function Field({
  name,
  label,
  span,
  type = "text",
  value,
  onChange,
  defaultValue,
}: {
  name: string;
  label: string;
  /** Columns of twelve at `lg`. Below that the grid collapses and the span stops applying. */
  span: string;
  type?: "text" | "date";
  /** A controlled field — the three the household's first row mirrors. */
  value?: string;
  onChange?: (value: string) => void;
  /** An uncontrolled field, read out of the `FormData` on submit. */
  defaultValue?: string;
}): React.ReactElement {
  return (
    <div className={`flex flex-col gap-1.5 ${span}`}>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <Input
        type={type}
        name={name}
        id={name}
        {...(onChange === undefined
          ? { defaultValue: defaultValue ?? "" }
          : { value: value ?? "", onChange: (event) => onChange(event.target.value) })}
      />
    </div>
  );
}

/** A section of the form: one card, one real `<h2>` inside its title (guide trap 1). */
function Section({
  heading,
  description,
  children,
  footer,
}: {
  heading: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{heading}</h2>
        </CardTitle>
        {description === undefined ? null : <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
      {footer === undefined ? null : (
        <CardFooter className="flex-col items-start gap-3">{footer}</CardFooter>
      )}
    </Card>
  );
}

/** The field grid: twelve columns at `lg`, two at `sm`, one below. */
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * A native `<select>` wearing this form's tokens and the height of its `Input`s.
 *
 * The recipe is `SELECT` from `einstellungen/settings-form.tsx` at a different control height: that
 * screen puts every control on `h-9`, this one leaves `Input` at its `h-8` default, and a select
 * carrying the other screen's height is exactly the ragged baseline `docs/ui_conversion_guide.md`
 * warns about. The disabled tokens come from `Input` too — the full register renders this control
 * greyed rather than removed.
 */
const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors " +
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30";

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

  // The numbers the dropdown offers: the register as the action re-read it after a lost race if it
  // sent one back, otherwise the reading the page was rendered with. Preferring the fresh list is
  // what stops the form going on offering a number that provably cannot be saved (US-24) — the
  // staff member's obvious next move, picking it again, would fail identically.
  const freeNumbers = state.freeNumbers ?? proposal.freeNumbers;

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
    <form action={formAction} className="flex flex-col gap-6">
      {/* Absent rather than empty for a walk-in: the field is metadata about where these people
          came from, and a blank string is not an answer to that. */}
      {previousCustomerId === null ? null : (
        <input type="hidden" name="previousCustomerId" value={previousCustomerId} />
      )}
      {entryId === null ? null : <input type="hidden" name="entryId" value={entryId} />}

      {/*
       * The refusal, at the top of the form rather than 1 600px down at the bottom of `Zuordnung`.
       *
       * A full register is not a dead end — turning an applicant away is precisely what the waiting
       * list exists to prevent (US-12, FR-3) — so the way onto it is offered with the refusal, as a
       * button rather than an underlined link. The form stays on screen below, disabled and not
       * removed: staff need to see that the fields exist and why they cannot be used.
       */}
      {full ? (
        <Alert variant="destructive" role="status">
          <AlertDescription
            data-testid="registration-error"
            className="flex max-w-prose flex-col items-start gap-3"
          >
            <p>{de.customers.errors.noFreeCustomerNumber(proposal.quotaN)}</p>
            <Button variant="outline" asChild>
              <Link href="/warteliste" data-testid="registration-waiting-list-link">
                {de.customers.new.waitingListLink}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
       * One card, not three.
       *
       * `Person` and `Anschrift` are one act — who this is and where they live — and the record
       * already calls that pair by one name (`record.detailsHeading`); using the same words on both
       * screens is most of what makes them read as one product. The certificate joins them because
       * it is what decides whether this household may be registered at all, and as a card of its
       * own it was two fields and 102px between two much larger sections. `Anschrift` survives as a
       * muted sub-label rather than a second `h2`.
       *
       * The saving is two card headers and two card paddings, ~180px, off the top of the form.
       */}
      <Section heading={de.customers.record.detailsHeading}>
        <div className={GRID}>
          <Field
            name="firstName"
            label={de.customers.fields.firstName}
            span="lg:col-span-4"
            value={firstName}
            onChange={setFirstName}
          />
          <Field
            name="lastName"
            label={de.customers.fields.lastName}
            span="lg:col-span-4"
            value={lastName}
            onChange={setLastName}
          />
          <Field
            name="birthDate"
            label={de.customers.fields.birthDate}
            span="lg:col-span-4"
            type="date"
            value={birthDate}
            onChange={setBirthDate}
          />
        </div>

        <p className="text-sm font-medium text-muted-foreground">
          {de.customers.new.addressHeading}
        </p>
        <div className={GRID}>
          <Field
            name="street"
            label={de.customers.fields.street}
            span="lg:col-span-5"
            defaultValue={draft?.street ?? ""}
          />
          <Field
            name="houseNumber"
            label={de.customers.fields.houseNumber}
            span="lg:col-span-2"
            defaultValue={draft?.houseNumber ?? ""}
          />
          <Field
            name="zip"
            label={de.customers.fields.zip}
            span="lg:col-span-2"
            defaultValue={draft?.zip ?? ""}
          />
          <Field
            name="city"
            label={de.customers.fields.city}
            span="lg:col-span-3"
            defaultValue={draft?.city ?? ""}
          />
        </div>

        <p className="text-sm font-medium text-muted-foreground">
          {de.customers.new.certificateHeading}
        </p>
        <div className={GRID}>
          <Field
            name="certificateType"
            label={de.customers.fields.certificateType}
            span="lg:col-span-6"
            defaultValue={draft?.certificateType ?? ""}
          />
          <Field
            name="certificateValidUntil"
            label={de.customers.fields.certificateValidUntil}
            span="lg:col-span-6"
            type="date"
            defaultValue={draft?.certificateValidUntil ?? ""}
          />
          <Field
            name="notes"
            label={de.customers.fields.notes}
            span="sm:col-span-2 lg:col-span-12"
            defaultValue={draft?.notes ?? ""}
          />
        </div>
      </Section>

      <Section
        heading={de.customers.new.householdHeading}
        description={de.customers.new.householdHint}
      >
        {/* Three fields repeating per member with identical meanings is tabular data. As a list of
            labelled grids the row identity had to live in the first field's label
            ("Haushaltsmitglied 1 — Vorname"), which wrapped to two lines in its column and started
            that input 20px below its two neighbours — in every row. As a table the identity is a
            narrow first column and the field names are said once. */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">{de.customers.new.memberNumberColumn}</TableHead>
              <TableHead>{de.customers.fields.firstName}</TableHead>
              <TableHead>{de.customers.fields.lastName}</TableHead>
              <TableHead>{de.customers.fields.birthDate}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((row, index) => (
              // Rows are addressed by position: two members can share a name and a birthdate, and a
              // row has no identity of its own until it is saved.
              <TableRow key={index} data-testid="household-row" className="hover:bg-transparent">
                <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                {/* Each input keeps the string its visible label used to carry as `aria-label`, so
                    nothing a screen reader hears is lost: a column heading names a column, not a
                    cell. */}
                <TableCell>
                  <Input
                    type="text"
                    name="memberFirstName"
                    id={`memberFirstName-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.firstName}`}
                    value={row.firstName}
                    onChange={(event) => updateRow(index, { firstName: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="text"
                    name="memberLastName"
                    id={`memberLastName-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.lastName}`}
                    value={row.lastName}
                    onChange={(event) => updateRow(index, { lastName: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    name="memberBirthDate"
                    id={`memberBirthDate-${index}`}
                    aria-label={`${de.customers.new.memberRow(index + 1)} — ${de.customers.fields.birthDate}`}
                    value={row.birthDate}
                    onChange={(event) => updateRow(index, { birthDate: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`remove-member-${index}`}
                    onClick={() => removeRow(index)}
                  >
                    {de.customers.new.removeMember}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-member"
            onClick={() => setRows([...members, EMPTY_ROW])}
          >
            {de.customers.new.addMember}
          </Button>
        </div>

        {/* The two figures the household section exists to produce, at the counter's rank rather
            than in two 408px bordered boxes holding one digit each. */}
        <div className="flex flex-wrap gap-3">
          <Stat
            label={de.customers.derived.grownUps}
            value={String(counts === null ? de.customers.derived.unknown : counts.grownUps)}
            testId="grown-ups"
            className="min-w-40"
          />
          <Stat
            label={de.customers.derived.children}
            value={String(counts === null ? de.customers.derived.unknown : counts.children)}
            testId="children"
            className="min-w-40"
          />
        </div>
        <p className="text-xs text-muted-foreground">{de.customers.derived.hint}</p>
      </Section>

      <Section
        heading={de.customers.new.assignmentHeading}
        footer={
          <>
            {state.status === "error" && state.message !== undefined ? (
              <Notice
                tone={state.tier ?? "error"}
                text={state.message}
                testId="registration-error"
              />
            ) : null}

            <Button type="submit" size="lg" disabled={pending || full}>
              {pending ? de.customers.new.submitting : de.customers.new.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-start gap-6">
          {/*
           * The number, as a control rather than as a figure (US-24).
           *
           * It used to be a read-only `Stat` beside a form that could not change it, which made the
           * one decision on this screen the software's rather than the staff member's. The tile is
           * *replaced* rather than joined by a control: two things showing one number is how they
           * start disagreeing.
           *
           * Native, not `components/ui/select.tsx`, for the reason the group radios below give: the
           * action reads `customerNumber` out of the `FormData` and a Radix select submits nothing
           * of its own. A native one is also type-ahead searchable over 240 options — typing `1`
           * then `5` lands on 15 — with no JavaScript of ours.
           *
           * Uncontrolled: `defaultValue` opens it on the lowest free slot, and a refused save then
           * leaves the staff member's own choice standing rather than snapping back to the
           * proposal (#91). When a lost race removes their number from the list the browser falls
           * back to the first option, which is the lowest free one again.
           */}
          <div className="flex w-56 flex-col gap-1.5">
            <label htmlFor="customerNumber" className="text-sm font-medium">
              {de.customers.fields.customerNumber}
            </label>
            <select
              className={SELECT}
              name="customerNumber"
              id="customerNumber"
              data-testid="customer-number-select"
              defaultValue={proposal.customerNumber ?? ""}
              disabled={full}
            >
              {freeNumbers.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
            {/* No hint on a full register: „0 freie Nummern — die niedrigste ist vorausgewählt“
                would be a sentence about a preselection that does not exist. The `Alert` at the top
                of the form is the message there, and it offers the waiting list with it. */}
            {full ? null : (
              <p data-testid="free-number-count" className="text-xs text-muted-foreground">
                {de.customers.assignment.freeNumberCount(freeNumbers.length)}
              </p>
            )}
          </div>

          {/*
           * The group choice, behind a disclosure (US-20). FD accept the proposal, so two
           * permanently visible radios were a control for a decision almost nobody makes, and they
           * made a card that can be two lines into five.
           *
           * What is *not* folded is the proposal and the two group sizes below: the sizes are what
           * an override is decided from, and a staff member must not have to open a control to see
           * that the register is lopsided. The summary names the proposed group in the group's own
           * colour and always with the word — a colour is a distinction only some of the staff can
           * make (US-03.4), and it is the word the specs assert.
           *
           * The `<details>` sits inside the `<form>` on purpose: a `<details>` is not a form
           * boundary, so the radios are submitted with everything else and a registration that
           * never opened it saves the `defaultChecked` proposal.
           *
           * It renders closed on every load and the state is not persisted anywhere: which group
           * the last registration chose says nothing about this one, and a control that remembers
           * being open would put the decision back on screen for the staff who never make it.
           */}
          <div className="flex flex-col gap-2">
            <details>
              {/* `w-fit` is right here, unlike the archive search's summary: this one is a control,
                  not a card header (`docs/ui_conversion_guide.md`). */}
              <summary
                data-testid="group-choice-open"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                )}
              >
                {de.customers.assignment.groupChoiceLabel}
                <Badge variant="outline" className={GROUP_STYLES[proposal.suggestedGroup]}>
                  {de.customers.groups[proposal.suggestedGroup]}
                </Badge>
                <span className="font-normal text-muted-foreground">
                  — {de.customers.assignment.groupChoiceOverride}
                </span>
              </summary>

              {/* Native radios, not Radix: the action reads `group` out of the `FormData` and a
                  `RadioGroup` submits nothing of its own. `#group-RED` is reached by CSS id in three
                  specs, so the ids are load-bearing too. Each option wears the colour it names —
                  this is the one screen where the group is actually *chosen*, and it was the one
                  screen showing RED and BLUE in black and white. */}
              <fieldset className="mt-3 flex flex-col gap-2">
                <legend className="text-sm font-medium">{de.customers.fields.group}</legend>
                <div className="flex flex-wrap gap-2">
                  {GROUPS.map((group) => (
                    <label
                      key={group}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${GROUP_STYLES[group]}`}
                    >
                      <input
                        type="radio"
                        name="group"
                        id={`group-${group}`}
                        value={group}
                        defaultChecked={group === proposal.suggestedGroup}
                        className="accent-current"
                      />
                      <span>{de.customers.groups[group]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </details>

            <p className="text-xs text-muted-foreground">
              {de.customers.assignment.suggestedGroup(de.customers.groups[proposal.suggestedGroup])}{" "}
              ·{" "}
              {de.customers.assignment.groupSizes(
                proposal.groupCounts.red,
                proposal.groupCounts.blue,
              )}
            </p>
          </div>
        </div>
      </Section>
    </form>
  );
}
