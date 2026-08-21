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
import { composition } from "@/domain/customer/householdComposition";
import { GROUPS } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { GROUP_STYLES } from "../../accents";
import { FieldRejection, useFocusFirstRefusal } from "../../field-mark";
import { marking, MEMBER_INPUT, memberPath, problemAt, type MemberPart } from "../../field-refusal";
import { selectClass } from "../../select";
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
 * The address, the certificate and the note, as the form holds them — raw strings, keyed by the
 * `name` each input carries.
 *
 * They are React state rather than `defaultValue`s, and that is the whole fix for a refusal that
 * used to delete them. React calls `form.reset()` once a `<form action>` resolves — on a refusal as
 * well as a save — and a reset restores each input from its `defaultValue` *attribute*, so seven
 * fields rewound to the pre-fill or to blank while the four that happened to be controlled kept
 * what was typed. A mistyped date cost a retyped address.
 *
 * `docs/guideline/ui_styling_guide.md` §7 gives three ways out, cheapest first, and the cheapest one
 * fits here: this form never returns on a save — it redirects to the new record — so there is
 * nothing for a reset to restore *to*, and controlled fields simply survive. The archive pre-fill
 * still clears them, because `registration-screen.tsx` applies a selection by remounting the form.
 *
 * One object rather than seven `useState` calls, the shape `kunden/[id]/details-editor.tsx` holds
 * the same fields in.
 */
interface DetailsDraft {
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
  readonly certificateType: string;
  readonly certificateValidUntil: string;
  readonly notes: string;
}

/** The address, certificate and note the form starts out with — the draft's, or blank. */
function initialDetails(draft: PrefillDraft | null): DetailsDraft {
  return {
    street: draft?.street ?? "",
    houseNumber: draft?.houseNumber ?? "",
    zip: draft?.zip ?? "",
    city: draft?.city ?? "",
    certificateType: draft?.certificateType ?? "",
    certificateValidUntil: draft?.certificateValidUntil ?? "",
    notes: draft?.notes ?? "",
  };
}

/**
 * The rows the counts can be derived from, as `Date`s.
 *
 * A row that is still being typed has no birthdate yet; counting it as anything would make the
 * display flicker between wrong answers, so it simply does not count until a date is there.
 */
function datedMembers(rows: ReadonlyArray<MemberRow>): Array<{ birthDate: Date }> {
  return rows.flatMap((row) => {
    // Half-typed days reach here on every keystroke — `11.0` is not a day yet — so the parser's
    // refusal is the ordinary case, not an error. The same reading as the server's, so the panel
    // cannot disagree with what the save will make of the same text (ADR-013).
    try {
      return [{ birthDate: parseCalendarDay(row.birthDate) }];
    } catch {
      return [];
    }
  });
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
 * The words under a refused control on this screen, at this screen's test id.
 *
 * The id stays off the summary, which keeps `registration-error` — several specs assert that
 * element's exact text, and one of them per screen is what keeps the assertion unambiguous.
 */
function Rejection({ id, problem }: { id: string; problem: string }): React.ReactElement {
  return <FieldRejection id={id} problem={problem} testId="registration-field-error" />;
}

/**
 * One field of the form, in a slot of the twelve-column grid.
 *
 * The span is the point. Every field on this screen used to be 408px because all four sections
 * shared one `sm:grid-cols-2`, so `PLZ` promised as much room as `Straße` — and a field's width is
 * the most reliable hint a form has about what it wants. `<label htmlFor>` + `<Input id>` rather
 * than the old nested `<label><span>`, which worked only by nesting and left the accessibility
 * snapshot with unnamed textboxes.
 *
 * Every field is controlled — see {@link DetailsDraft} for why none of them may be a `defaultValue`.
 */
function Field({
  name,
  label,
  span,
  type = "text",
  value,
  onChange,
  problem = null,
}: {
  name: string;
  label: string;
  /** Columns of twelve at `lg`. Below that the grid collapses and the span stops applying. */
  span: string;
  type?: "text" | "date";
  value: string;
  onChange: (value: string) => void;
  /** The words to show under the control, or `null` while nothing is wrong with it. */
  problem?: string | null;
}): React.ReactElement {
  const marks = marking(name, name, problem);
  return (
    <div className={`flex flex-col gap-1.5 ${span}`}>
      <label
        htmlFor={name}
        className={`text-sm font-medium ${problem === null ? "" : "text-destructive"}`.trimEnd()}
      >
        {label}
      </label>
      {type === "date" ? (
        <DateInput
          name={name}
          id={name}
          placeholder={de.day.placeholder}
          value={value}
          onChange={onChange}
          {...marks}
        />
      ) : (
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...marks}
        />
      )}
      {problem === null ? null : <Rejection id={name} problem={problem} />}
    </div>
  );
}

/**
 * One cell of the household table: the control, and the mark under it when that field was refused.
 *
 * Three fields repeating per member is tabular data, so the field names are said once in the column
 * headings — but a column heading names a column and not a cell, so each input keeps the string its
 * visible label used to carry as `aria-label` and nothing a screen reader hears is lost.
 *
 * The cells are top-aligned: a mark makes one cell taller than its neighbours, and without it the
 * controls in a refused row would sit at three different heights.
 */
function MemberCell({
  index,
  part,
  value,
  onChange,
  problem,
}: {
  index: number;
  part: MemberPart;
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
}): React.ReactElement {
  const name = MEMBER_INPUT[part];
  const id = `${name}-${index}`;
  const label = `${de.customers.new.memberRow(index + 1)} — ${de.customers.fields[part]}`;
  const marks = marking(memberPath(index, part), id, problem);

  return (
    <TableCell className="align-top">
      <div className="flex flex-col gap-1">
        {part === "birthDate" ? (
          <DateInput
            name={name}
            id={id}
            aria-label={label}
            placeholder={de.day.placeholder}
            value={value}
            onChange={onChange}
            {...marks}
          />
        ) : (
          <Input
            type="text"
            name={name}
            id={id}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            {...marks}
          />
        )}
        {problem === null ? null : <Rejection id={id} problem={problem} />}
      </div>
    </TableCell>
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
 * A field's two rows — the label and the control — laid on the grid's own tracks, from
 * `einstellungen/settings-form.tsx`.
 *
 * `Zuordnung` is where this form needs it, and for the reason the guide's `/kunden/neu` finding now
 * records: not a label that wraps, but a column that had no label row at all. The group choice
 * carried its name inside its own summary button, so the `Kundennummer` select sat 26px below its
 * neighbour and the two hint lines under them 24px apart. Each column spans two of the parent's rows
 * and inherits them, so both controls land on one baseline whatever the labels do — and it re-solves
 * itself when the grid collapses at `sm`. Each field then has exactly two children; a hint under the
 * control wraps both in one element.
 */
const FIELD_ROWS = "grid grid-rows-subgrid row-span-2 gap-1.5";

/**
 * A native `<select>` at the height of this form's `Input`s.
 *
 * `/einstellungen` puts every control on `h-9`, this screen leaves `Input` at its `h-8` default, and
 * a select carrying the other screen's height is exactly the ragged baseline
 * `docs/guideline/ui_styling_guide.md` §3 warns about. The full register renders this control greyed rather
 * than removed, which is what the shared recipe's `disabled:` tokens are for.
 */
const SELECT = selectClass("h-8");

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
  const [details, setDetails] = useState<DetailsDraft>(initialDetails(draft));
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

  const [picked, setPicked] = useState<number | null>(proposal.customerNumber);
  // Controlled for the reason the number is: `defaultChecked` is undone by React's post-action
  // `form.reset()`, so an override to the other group was silently rewound to the proposal by the
  // very refusal the staff member was about to correct.
  const [chosenGroup, setChosenGroup] = useState(proposal.suggestedGroup);

  const counts = derivedCounts(members, proposal.today);
  const full = proposal.customerNumber === null;

  // The numbers the dropdown offers: the register as the action re-read it after a lost race if it
  // sent one back, otherwise the reading the page was rendered with. Preferring the fresh list is
  // what stops the form going on offering a number that provably cannot be saved (US-24) — the
  // staff member's obvious next move, picking it again, would fail identically.
  const freeNumbers = state.freeNumbers ?? proposal.freeNumbers;

  // The number the control shows: the staff member's own pick, unless a lost race has just taken it
  // out of the register — then the lowest that is still free, which is where the dropdown opened in
  // the first place. Derived rather than stored, so the correction happens in the same render the
  // fresh pool arrives in and there is no effect that could show a dead number for a frame.
  const chosen = picked !== null && freeNumbers.includes(picked) ? picked : (freeNumbers[0] ?? "");

  // One form on this screen, so the whole document is the right place to look for the control the
  // refusal named — see `useFocusFirstRefusal` for the screens where it is not.
  useFocusFirstRefusal(state.fields);

  const problem = (path: string): string | null => problemAt(state.fields, path);
  // Read once rather than three times: the number's control, its label and its mark are written out
  // by hand here — it is a `<select>` in a two-row subgrid rather than one of `Field`'s boxes.
  const numberProblem = problem("customerNumber");

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
            problem={problem("firstName")}
          />
          <Field
            name="lastName"
            label={de.customers.fields.lastName}
            span="lg:col-span-4"
            value={lastName}
            onChange={setLastName}
            problem={problem("lastName")}
          />
          <Field
            name="birthDate"
            label={de.customers.fields.birthDate}
            span="lg:col-span-4"
            type="date"
            value={birthDate}
            onChange={setBirthDate}
            problem={problem("birthDate")}
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
            value={details.street}
            onChange={(street) => setDetails({ ...details, street })}
            problem={problem("street")}
          />
          <Field
            name="houseNumber"
            label={de.customers.fields.houseNumber}
            span="lg:col-span-2"
            value={details.houseNumber}
            onChange={(houseNumber) => setDetails({ ...details, houseNumber })}
            problem={problem("houseNumber")}
          />
          <Field
            name="zip"
            label={de.customers.fields.zip}
            span="lg:col-span-2"
            value={details.zip}
            onChange={(zip) => setDetails({ ...details, zip })}
            problem={problem("zip")}
          />
          <Field
            name="city"
            label={de.customers.fields.city}
            span="lg:col-span-3"
            value={details.city}
            onChange={(city) => setDetails({ ...details, city })}
            problem={problem("city")}
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
            value={details.certificateType}
            onChange={(certificateType) => setDetails({ ...details, certificateType })}
            problem={problem("certificateType")}
          />
          <Field
            name="certificateValidUntil"
            label={de.customers.fields.certificateValidUntil}
            span="lg:col-span-6"
            type="date"
            value={details.certificateValidUntil}
            onChange={(certificateValidUntil) => setDetails({ ...details, certificateValidUntil })}
            problem={problem("certificateValidUntil")}
          />
          <Field
            name="notes"
            label={de.customers.fields.notes}
            span="sm:col-span-2 lg:col-span-12"
            value={details.notes}
            onChange={(notes) => setDetails({ ...details, notes })}
            problem={problem("notes")}
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
                <TableCell className="align-top text-muted-foreground tabular-nums">
                  {index + 1}
                </TableCell>
                <MemberCell
                  index={index}
                  part="firstName"
                  value={row.firstName}
                  onChange={(firstName) => updateRow(index, { firstName })}
                  problem={problem(memberPath(index, "firstName"))}
                />
                <MemberCell
                  index={index}
                  part="lastName"
                  value={row.lastName}
                  onChange={(lastName) => updateRow(index, { lastName })}
                  problem={problem(memberPath(index, "lastName"))}
                />
                <MemberCell
                  index={index}
                  part="birthDate"
                  value={row.birthDate}
                  onChange={(birthDate) => updateRow(index, { birthDate })}
                  problem={problem(memberPath(index, "birthDate"))}
                />
                <TableCell className="align-top">
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
        <div className={GRID}>
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
           * Controlled, opening on the lowest free slot, so that a refused save leaves the staff
           * member's own choice standing rather than snapping back to the proposal (#91). It used
           * to be a `defaultValue` for that, which is precisely what React's post-action
           * `form.reset()` undoes — see {@link DetailsDraft}. When a lost race removes their number
           * from the register, {@link chosen} falls back to the lowest that is still free.
           */}
          <div className={`${FIELD_ROWS} lg:col-span-2`}>
            <label
              htmlFor="customerNumber"
              className={`self-start text-sm font-medium ${
                numberProblem === null ? "" : "text-destructive"
              }`.trimEnd()}
            >
              {de.customers.fields.customerNumber}
            </label>
            {/* One grid row, two elements, so the subgrid above still sees a single row. Two of
                twelve is what a box holding at most three digits asks for — the span `PLZ` gets in
                `Person und Anschrift` — and it is what the hint beneath was shortened to fit. */}
            <div className="flex flex-col gap-1.5">
              <select
                className={SELECT}
                name="customerNumber"
                id="customerNumber"
                data-testid="customer-number-select"
                value={chosen}
                onChange={(event) => setPicked(Number(event.target.value))}
                disabled={full}
                {...marking("customerNumber", "customerNumber", numberProblem)}
              >
                {freeNumbers.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
              {numberProblem === null ? null : (
                <Rejection id="customerNumber" problem={numberProblem} />
              )}
              {/* No hint on a full register: „0 freie Nummern — die niedrigste ist vorausgewählt“
                  would be a sentence about a preselection that does not exist. The `Alert` at the
                  top of the form is the message there, and it offers the waiting list with it. */}
              {full ? null : (
                <p data-testid="free-number-count" className="text-xs text-muted-foreground">
                  {de.customers.assignment.freeNumberCount(freeNumbers.length)}
                </p>
              )}
            </div>
          </div>

          {/*
           * The group choice, behind a disclosure (US-20). DF accept the proposal, so two
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
          <div className={`${FIELD_ROWS} lg:col-span-6`}>
            {/* A `<span>`, not a `<label>`: `<summary>` is not a labelable element, and this names a
                set of radios rather than one control. It is the field label the column was missing —
                the summary used to carry „Gruppe:“ itself, which read as a label but sat in the
                control's own row and left this one empty. */}
            <span id="groupChoice-label" className="self-start text-sm font-medium">
              {de.customers.fields.group}
            </span>
            <div className="flex flex-col gap-1.5">
              <details>
                {/* `w-fit` is right here, unlike the archive search's summary: this one is a control,
                    not a card header (`docs/guideline/ui_styling_guide.md` §6). */}
                <summary
                  data-testid="group-choice-open"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                  )}
                >
                  <Badge variant="outline" className={GROUP_STYLES[proposal.suggestedGroup]}>
                    {de.customers.groups[proposal.suggestedGroup]}
                  </Badge>
                  <span className="font-normal text-muted-foreground">
                    {de.customers.assignment.groupChoiceOverride}
                  </span>
                </summary>

                {/* Native radios, not Radix: the action reads `group` out of the `FormData` and a
                    `RadioGroup` submits nothing of its own. `#group-RED` is reached by CSS id in
                    three specs, so the ids are load-bearing too. Each option wears the colour it
                    names — this is the one screen where the group is actually *chosen*, and it was
                    the one screen showing RED and BLUE in black and white.

                    Named by the label above rather than by a `<legend>` of its own, which would put
                    „Gruppe“ on screen twice in one column. */}
                <fieldset className="mt-3 flex flex-wrap gap-2" aria-labelledby="groupChoice-label">
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
                        checked={group === chosenGroup}
                        onChange={() => setChosenGroup(group)}
                        className="accent-current"
                      />
                      <span>{de.customers.groups[group]}</span>
                    </label>
                  ))}
                </fieldset>
              </details>

              <p className="text-xs text-muted-foreground">
                {de.customers.assignment.suggestedGroup(
                  de.customers.groups[proposal.suggestedGroup],
                )}{" "}
                ·{" "}
                {de.customers.assignment.groupSizes(
                  proposal.groupCounts.red,
                  proposal.groupCounts.blue,
                )}
              </p>
            </div>
          </div>
        </div>
      </Section>
    </form>
  );
}
