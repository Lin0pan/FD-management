"use client";

/**
 * The registration form.
 *
 * A client component for two reasons: `useActionState` reports a rejection back into the page, and
 * the household counts have to update *as staff type*. Those counts are not computed here — the form
 * calls the domain rule (`composition`) against the day the server handed it, so the number on
 * screen is the same number the save will derive. There is no input for them by design.
 *
 * The form holds no other rules. Which number a household gets and whether it holds together are
 * decided behind `registerCustomer`, and so is the group — it is the number's parity (US-31), which
 * is why the group radios in `Zuordnung` submit nothing at all: they filter the number list in the
 * browser, out of the pool the server sent, and the form posts the number alone.
 *
 * It may arrive pre-filled — from an archived record (US-11.4) or from a waiting-list entry
 * (US-12.4). The draft is read once, as the initial value of every field: the screen remounts the
 * form when the selection changes, so there is no second source of truth to keep in step, and every
 * pre-filled field is as editable as one that was typed. Neither draft carries a number, because a
 * slot is taken afresh and the group comes with it; whether it carries a certificate is the one
 * honest difference between them, and `PrefillDraft` says why.
 *
 * The action it submits to is a prop for the same reason the parsing is shared: a promotion off the
 * waiting list must register *and* clear the entry, in that order, and that pairing belongs in a use
 * case rather than in whichever screen remembers to do both.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import type { RegistrationProposal } from "@/application/customers/propose-registration";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { GROUPS, inGroup, type Group } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { GROUP_STYLES } from "../../accents";
import { guardEnter } from "../../enter-guard";
import { FieldRejection, useFocusFirstRefusal } from "../../field-mark";
import { marking, MEMBER_INPUT, memberPath, problemAt, type MemberPart } from "../../field-refusal";
import { selectClass } from "../../select";
import { Stat } from "../../stat";
import { EMPTY_ROW, isCustomerRow, type MemberRow, ROW_TEXT } from "../household-row";
import { Notice } from "../../notice";
import { submitRegistration } from "./actions";
import type { PrefillDraft } from "./archive-search-state";
import {
  initialRegisterCustomerState,
  type RegisterCustomerState,
} from "./register-customer-state";

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
  readOnly = false,
}: {
  index: number;
  part: MemberPart;
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
  /**
   * `readOnly`, never `disabled`: a disabled input submits nothing, and the three columns are read
   * back as parallel lists paired by position (`householdRows`) — a dropped value would shift every
   * row below it onto somebody else's name.
   */
  readOnly?: boolean;
}): React.ReactElement {
  const name = MEMBER_INPUT[part];
  const id = `${name}-${index}`;
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
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            readOnly={readOnly}
            className={quiet}
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

/**
 * Which row is the applicant themselves, when the form opens.
 *
 * A walk-in starts on the blank first row: it is the applicant's, and it fills itself in as their
 * name is typed. A **draft** is the household as an archived record or a waiting-list entry listed
 * it, and there is no promise the applicant is first — or there at all — so the row is looked for by
 * what it says. `null` means none of them is theirs yet, and the form locks nothing: the household
 * is then one the save refuses until a row for them is typed.
 */
function initialCustomerRow(
  draft: PrefillDraft | null,
  rows: ReadonlyArray<MemberRow>,
): number | null {
  if (draft === null) {
    return 0;
  }
  const at = rows.findIndex((row) => isCustomerRow(row, draft));
  return at === -1 ? null : at;
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
  // Which row is the applicant's own. It mirrors the personal data above and is not editable here:
  // the registered person *is* a household member, typing their name twice is how a household ends
  // up with a phantom extra head, and a household they are not in is one the save refuses
  // (`createHouseholdMembers`). A correction to their name therefore moves the row with it, which
  // is what `replaceHouseholdMember` does on the record once they are registered.
  const [customerRow, setCustomerRow] = useState(() =>
    initialCustomerRow(draft, initialRows(draft)),
  );

  const members: ReadonlyArray<MemberRow> = rows.map((row, index) =>
    index === customerRow ? { firstName, lastName, birthDate } : row,
  );

  const [picked, setPicked] = useState<number | null>(proposal.customerNumber);
  // Controlled, and for a reason of its own beyond the number's: the group is not a field any more
  // (US-31.6), so this state *is* the choice — nothing about it comes back from the server, and a
  // staff member who picked BLUE and lost the race for a number has to come back to BLUE's
  // remaining slots rather than to the proposal's. On a full register the value is never read: both
  // radios are then disabled and the alert at the top of the form is the answer.
  const [chosenGroup, setChosenGroup] = useState<Group>(proposal.suggestedGroup ?? "RED");

  const counts = derivedCounts(members, proposal.today);
  const full = proposal.customerNumber === null;

  // The numbers the dropdown offers: the register as the action re-read it after a lost race if it
  // sent one back, otherwise the reading the page was rendered with. Preferring the fresh list is
  // what stops the form going on offering a number that provably cannot be saved (US-24) — the
  // staff member's obvious next move, picking it again, would fail identically.
  const freeNumbers = state.freeNumbers ?? proposal.freeNumbers;

  // What the pool leaves each group — the one derivation the whole assignment block reads from: the
  // radios take whether a group has anything to offer, the select takes its options, and the hint
  // beneath takes the two figures. Split here rather than at each of them, so the three cannot
  // disagree about what „frei" means.
  const freeInGroup: Record<Group, ReadonlyArray<number>> = {
    RED: inGroup(freeNumbers, "RED"),
    BLUE: inGroup(freeNumbers, "BLUE"),
  };
  const otherGroup: Group = chosenGroup === "RED" ? "BLUE" : "RED";
  // The group the controls stand on: the staff member's own choice, unless a lost race has emptied
  // it since — a group that can no longer be chosen must not stay chosen either, or the select
  // below would be an empty list under a checked radio. On a full register neither group has
  // anything, and the choice is left where it was because nothing below it can be used anyway.
  const group =
    freeInGroup[chosenGroup].length > 0 || freeInGroup[otherGroup].length === 0
      ? chosenGroup
      : otherGroup;

  // The numbers that group offers, filtered in the browser from the pool the server sent: changing
  // the radio is a decision the screen already holds the answer to, and a round trip to re-ask
  // would be a round trip to look at a list it has.
  const offered = freeInGroup[group];

  // The number the control shows: the staff member's own pick, unless the group moved under it or a
  // lost race has just taken it out of the register — then the lowest this group still has, which
  // is where the dropdown opened in the first place. Derived rather than stored, so the correction
  // happens in the same render the fresh pool arrives in and there is no effect that could show a
  // dead number for a frame.
  const chosen = picked !== null && offered.includes(picked) ? picked : (offered[0] ?? "");

  // One form on this screen, so the whole document is the right place to look for the control the
  // refusal named — see `useFocusFirstRefusal` for the screens where it is not.
  useFocusFirstRefusal(state.fields);

  const problem = (path: string): string | null => problemAt(state.fields, path);
  // Read once rather than three times: the number's control, its label and its mark are written out
  // by hand here — it is a `<select>` in a two-row subgrid rather than one of `Field`'s boxes.
  const numberProblem = problem("customerNumber");

  function updateRow(index: number, patch: Partial<MemberRow>): void {
    setRows(
      members.map((row, position) => (position === index ? { ...row, ...patch } : { ...row })),
    );
  }

  function removeRow(index: number): void {
    if (index === customerRow) {
      return;
    }
    setRows(members.filter((_row, position) => position !== index));
    // The rows below have moved up one, so the applicant's row is one lower than it was.
    if (customerRow !== null && index < customerRow) {
      setCustomerRow(customerRow - 1);
    }
  }

  return (
    // Enter in a field does nothing; the registration is saved by its button. This is the screen
    // DF reported it from — see `enter-guard.ts` for why, and for the five other forms that
    // followed. The archive-search panel is a sibling form and keeps its Enter.
    <form action={formAction} onKeyDown={guardEnter} className="flex flex-col gap-6">
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

      <Section heading={de.customers.new.householdHeading}>
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
                  <div className={ROW_TEXT}>{index + 1}</div>
                </TableCell>
                <MemberCell
                  index={index}
                  part="firstName"
                  value={row.firstName}
                  onChange={(firstName) => updateRow(index, { firstName })}
                  problem={problem(memberPath(index, "firstName"))}
                  readOnly={index === customerRow}
                />
                <MemberCell
                  index={index}
                  part="lastName"
                  value={row.lastName}
                  onChange={(lastName) => updateRow(index, { lastName })}
                  problem={problem(memberPath(index, "lastName"))}
                  readOnly={index === customerRow}
                />
                <MemberCell
                  index={index}
                  part="birthDate"
                  value={row.birthDate}
                  onChange={(birthDate) => updateRow(index, { birthDate })}
                  problem={problem(memberPath(index, "birthDate"))}
                  readOnly={index === customerRow}
                />
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`remove-member-${index}`}
                    disabled={index === customerRow}
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
        {/*
         * One block for one decision: the group first, the numbers that group offers beneath it,
         * and what each group has left under that. The group is the meaningful choice and the
         * number is administrative, so that is the reading order — and the two are the *same*
         * decision now, because the number is what says which week the household collects (US-31).
         */}
        <div className="flex flex-col gap-4">
          {/*
           * The group choice, unfolded — the `<details>` US-20 put around it is gone, deliberately.
           *
           * It was folded because DF accept the proposal, so two permanently visible radios were a
           * control for a decision almost nobody makes. That argument does not survive US-31: the
           * group now *drives the list beneath it*, and a folded control cannot show that BLUE has
           * nothing left to offer. Re-folding it would hide the one thing on this screen a staff
           * member cannot work out for themselves.
           *
           * The radios carry **no `name`**: a named control is submitted, and this pair is browser
           * state. The form posts the number alone, which is the whole of US-31 on one screen — a
           * group that cannot be submitted cannot be submitted disagreeing with the number beside
           * it. Mutual exclusion is React's, off `checked`.
           *
           * Each option wears the colour it names and always carries the word: a colour is a
           * distinction only some of the staff can make (US-03.4). `#group-RED` is reached by CSS
           * id in the e2e suite, so the ids are load-bearing too.
           */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{de.customers.fields.group}</legend>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {GROUPS.map((option) => {
                // A group with nothing to offer cannot be chosen, and the sentence beside it says
                // why. Not an empty dropdown and not a refusal at save time: the register can be
                // half free and this half of it full, and this is where staff meet that.
                const soldOut = freeInGroup[option].length === 0;
                return (
                  <div key={option} className="flex items-center gap-2">
                    <label
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${GROUP_STYLES[option]} ${soldOut ? "opacity-60" : ""}`.trimEnd()}
                    >
                      <input
                        type="radio"
                        id={`group-${option}`}
                        value={option}
                        checked={option === group}
                        // What keeps that `checked` standing through a refusal. React resets the
                        // form once its action resolves, and a reset restores a radio from its
                        // `checked` **attribute** — the one the server rendered — while the
                        // `checked` *prop* has not changed, so React repaints nothing and the dot
                        // silently rewinds to the proposal under a list that is still filtered by
                        // the group staff picked. Keeping the default equal to the state makes the
                        // reset a no-op, which is the whole fix; the text fields get it for free,
                        // because React syncs `defaultValue` for them and not `defaultChecked`.
                        ref={(node) => {
                          if (node !== null) {
                            node.defaultChecked = option === group;
                          }
                        }}
                        // Disabled on a full register too, where the alert at the top of the form
                        // and the disabled submit are the message and a per-group reason would be
                        // three ways of saying the same thing.
                        disabled={full || soldOut}
                        aria-describedby={soldOut && !full ? `group-${option}-full` : undefined}
                        onChange={() => {
                          setChosenGroup(option);
                          // Back to the group's own lowest, rather than keeping a number that
                          // belongs to the group they just left — it is not on the list any more.
                          setPicked(null);
                        }}
                        className="accent-current"
                      />
                      <span>{de.customers.groups[option]}</span>
                    </label>
                    {soldOut && !full ? (
                      <p
                        id={`group-${option}-full`}
                        className="max-w-prose text-xs text-muted-foreground"
                      >
                        {de.customers.assignment.groupFull(de.customers.groups[option])}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {/* The recommendation and the two group sizes: what an override is decided from. The
                sizes stay whatever the register looks like — a staff member must be able to see for
                themselves that it has drifted — while the proposal is named only where there is
                one, which is everywhere but a full register (US-31.3). */}
            <p data-testid="group-proposal" className="max-w-prose text-xs text-muted-foreground">
              {proposal.suggestedGroup === null
                ? null
                : `${de.customers.assignment.suggestedGroup(
                    de.customers.groups[proposal.suggestedGroup],
                  )} · `}
              {de.customers.assignment.groupSizes(
                proposal.groupCounts.red,
                proposal.groupCounts.blue,
              )}
            </p>
          </fieldset>

          {/*
           * The number, as a control rather than as a figure (US-24), and now as the second half of
           * the choice above: it offers the numbers of the group that is checked, and changing that
           * radio re-filters it in the browser.
           *
           * It used to be a read-only `Stat` beside a form that could not change it, which made the
           * one decision on this screen the software's rather than the staff member's. The tile is
           * *replaced* rather than joined by a control: two things showing one number is how they
           * start disagreeing.
           *
           * Native, not `components/ui/select.tsx`: the action reads `customerNumber` out of the
           * `FormData` and a Radix select submits nothing of its own. A native one is also
           * type-ahead searchable over 240 options — typing `1` then `5` lands on 15 — with no
           * JavaScript of ours.
           *
           * Controlled, opening on the lowest free slot of the recommended group, so that a refused
           * save leaves the staff member's own choice standing rather than snapping back to the
           * proposal (#91). It used to be a `defaultValue` for that, which is precisely what
           * React's post-action `form.reset()` undoes — see {@link DetailsDraft}. When a lost race
           * removes their number from the register, {@link chosen} falls back to the lowest that
           * is still free in the group they are standing in.
           */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="customerNumber"
              className={`text-sm font-medium ${
                numberProblem === null ? "" : "text-destructive"
              }`.trimEnd()}
            >
              {de.customers.fields.customerNumber}
            </label>
            {/* A box holding at most three digits, at the width the record's control has for the
                same list (`kunden/[id]/number-control.tsx`) — the two are one decision made in two
                places, and R-11 asks them to look it. */}
            <select
              className={`${SELECT} sm:w-32`}
              name="customerNumber"
              id="customerNumber"
              data-testid="customer-number-select"
              value={chosen}
              onChange={(event) => setPicked(Number(event.target.value))}
              disabled={full}
              {...marking("customerNumber", "customerNumber", numberProblem)}
            >
              {offered.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
            {numberProblem === null ? null : (
              <Rejection id="customerNumber" problem={numberProblem} />
            )}
            {/* Two figures rather than one total, because a group can be full while the register is
                not — this is the only place on the screen that fact is a number. No hint at all on
                a full register: „Noch frei — Rot: 0, Blau: 0“ would be a shortage stated twice, and
                the `Alert` at the top of the form is the message there, offering the waiting list
                with it. */}
            {full ? null : (
              <p
                data-testid="free-numbers-by-group"
                className="max-w-prose text-xs text-muted-foreground"
              >
                {de.customers.assignment.freeNumbersByGroup(
                  freeInGroup.RED.length,
                  freeInGroup.BLUE.length,
                )}
              </p>
            )}
          </div>
        </div>
      </Section>
    </form>
  );
}
