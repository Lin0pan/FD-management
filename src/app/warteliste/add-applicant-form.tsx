"use client";

/**
 * The "auf die Warteliste setzen" form (US-12.4). A client component so `useActionState` can report a
 * rejection beside the fields, and so the form clears itself once an applicant is saved — staff
 * usually write down one person and then the next.
 *
 * Clearing is a `key` remount, the only trick that resets controlled and uncontrolled inputs alike.
 * The key is the count saved so far, derived from the state rather than bumped in an effect.
 *
 * **The fields are controlled, and they live in `Fields`, under that key** — row one of
 * `docs/guideline/ui_styling_guide.md` §7's table: state under the key is both the clearing and the
 * keeping. Uncontrolled they were only ever cleared, because React calls `form.reset()` once a
 * `<form action>` resolves, refusal as well as save, so a mistyped day cost a retyped address.
 *
 * No rules here — `addToWaitingList` decides.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { de } from "@/i18n/de";
import { addApplicantAction } from "./actions";
import { ADD_FORM_ANCHOR } from "./add-form-anchor";
import { initialAddApplicantState } from "./waiting-list-state";
import { guardEnter } from "../enter-guard";
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt, type FieldRefusal } from "../field-refusal";
import { Notice } from "../notice";

/** The ten fields as the form holds them: raw strings, keyed by the `name` each input carries. */
type Application = Record<ApplicationField, string>;

type ApplicationField = (typeof APPLICATION_FIELDS)[number];

/**
 * Every field the form submits, in reading order. Listed once and used three times — the blank state,
 * the grid, and the lookup that marks them — because a field missing from any one of the three fails
 * silently: not submitted, not cleared, or not markable.
 */
const APPLICATION_FIELDS = [
  "firstName",
  "lastName",
  "birthDate",
  "street",
  "houseNumber",
  "zip",
  "city",
  "certificateType",
  "certificateValidUntil",
  "contactNote",
] as const;

const BLANK: Application = Object.fromEntries(
  APPLICATION_FIELDS.map((name) => [name, ""]),
) as Application;

/** The nine boxes of the grid, in order, and which of them wants a day. */
const GRID_FIELDS: ReadonlyArray<{ name: ApplicationField; label: string; day?: true }> = [
  { name: "firstName", label: de.customers.fields.firstName },
  { name: "lastName", label: de.customers.fields.lastName },
  { name: "birthDate", label: de.customers.fields.birthDate, day: true },
  { name: "street", label: de.customers.fields.street },
  { name: "houseNumber", label: de.customers.fields.houseNumber },
  { name: "zip", label: de.customers.fields.zip },
  { name: "city", label: de.customers.fields.city },
  { name: "certificateType", label: de.customers.fields.certificateType },
  { name: "certificateValidUntil", label: de.customers.fields.certificateValidUntil, day: true },
];

/**
 * `<Label htmlFor>` + `<Input id>` rather than a nested control. The `id`s are load-bearing anyway
 * (`waiting-list.spec.ts` fills by CSS id), and the `id` is the `name` is the path a refusal marks
 * by, so all three agree without a translation.
 */
function Field({
  name,
  label,
  type = "text",
  value,
  onChange,
  problem,
  hint,
}: {
  name: string;
  label: string;
  type?: "text" | "date";
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
  /** The line under the control where a field has something to explain about itself. */
  hint?: string;
}): React.ReactElement {
  const marks = marking(name, name, problem);
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name} className={problem === null ? undefined : "text-destructive"}>
        {label}
      </Label>
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
      {problem === null ? null : (
        <FieldRejection id={name} problem={problem} testId="waiting-list-field-error" />
      )}
      {hint === undefined ? null : <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** The ten fields, holding the application in progress. Under the key, so a save empties them. */
function Fields({
  fields,
}: {
  fields: ReadonlyArray<FieldRefusal> | undefined;
}): React.ReactElement {
  const [values, setValues] = useState<Application>(BLANK);
  const set = (name: ApplicationField, value: string): void =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GRID_FIELDS.map((field) => (
          <Field
            key={field.name}
            name={field.name}
            label={field.label}
            type={field.day === true ? "date" : "text"}
            value={values[field.name]}
            onChange={(value) => set(field.name, value)}
            problem={problemAt(fields, field.name)}
          />
        ))}
      </div>
      <Field
        name="contactNote"
        label={de.waitingList.add.contactNoteLabel}
        value={values.contactNote}
        onChange={(value) => set("contactNote", value)}
        problem={problemAt(fields, "contactNote")}
        hint={de.waitingList.add.contactNoteHint}
      />
    </>
  );
}

export function AddApplicantForm(): React.ReactElement {
  const [state, action, pending] = useActionState(addApplicantAction, initialAddApplicantState);
  const answer = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const fields = state.status === "error" ? state.fields : undefined;
  useFocusFirstRefusal(fields, form);

  // The one place the viewport rule needs help. Nothing scrolls, but the applicant just added
  // arrives as a *new row in the list above this form*, pushing the button and its confirmation down
  // by that row's height — 905px of a 900px viewport, measured.
  //
  // Asked rather than assumed, and `block: "center"` rather than `"nearest"`: the row is inserted in
  // the same commit, and `"nearest"` scrolls by the minimum the layout claims at that moment.
  useEffect((): void => {
    if (state.status !== "saved") {
      return;
    }
    const box = answer.current?.getBoundingClientRect();
    if (box !== undefined && (box.bottom > window.innerHeight || box.top < 0)) {
      answer.current?.scrollIntoView({ block: "center" });
    }
  }, [state]);

  return (
    // Named, so the button beside the heading can jump here: staff arrive from /kunden/neu with a
    // person in front of them and the form below the whole queue. `scroll-mt-16` clears the sticky
    // bar, which would otherwise cover this card's heading on arrival.
    <Card id={ADD_FORM_ANCHOR} className="scroll-mt-16">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{de.waitingList.add.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={form} action={action} onKeyDown={guardEnter} className="flex flex-col gap-4">
          {/* The remount that clears the form for the next applicant. It keys on how many have been
              saved, not on the message, so a second applicant of the same name still resets it —
              and a refusal, which does not change the count, leaves every field as it was typed. */}
          <Fields key={state.savedCount} fields={fields} />

          {state.status === "error" && state.message !== undefined ? (
            <Notice
              tone={state.tier ?? "error"}
              text={state.message}
              testId="waiting-list-add-error"
            />
          ) : null}
          {state.status === "saved" && state.message !== undefined ? (
            <div ref={answer}>
              <Notice tone="success" text={state.message} testId="waiting-list-add-saved" />
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="self-start"
            disabled={pending}
            data-testid="waiting-list-add-submit"
          >
            {pending ? de.waitingList.add.submitting : de.waitingList.add.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
