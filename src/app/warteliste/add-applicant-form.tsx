"use client";

/**
 * The "auf die Warteliste setzen" form (US-12.4).
 *
 * A client component for two reasons: `useActionState` reports a rejection — most often an expired
 * certificate — back beside the fields, and the form clears itself once an applicant has been saved,
 * because staff usually write down one person and then the next.
 *
 * Clearing is a `key` remount rather than a field-by-field reset: the same trick the registration
 * screen uses, and the only one that resets controlled and uncontrolled inputs alike. The key is the
 * count of applicants saved so far, which the action keeps — derived from the state rather than
 * bumped in an effect, so there is no render that shows the saved applicant's details a second time.
 *
 * The fields are **controlled**, and they live in `Fields`, under that key. That placement is the
 * whole mechanism, and it is row one of `docs/guideline/ui_styling_guide.md` §7's table: a form that
 * already remounts on a save needs nothing else to clear it, so state under the key is both the
 * clearing and the keeping. Uncontrolled, they were only ever cleared — React calls `form.reset()`
 * once a `<form action>` resolves, on a refusal as well as a save, and a reset restores each input
 * from its `defaultValue` attribute. Eight of the ten fields were emptied by every rejection, so a
 * mistyped day cost a retyped address, and the two that survived did so by accident: `DateInput`
 * holds its own state and is controlled from React's point of view whatever it is passed.
 *
 * (The record's renewal form cites this file as its model for exactly that placement. It was the
 * model for where the state goes; it was not yet an example of the state existing.)
 *
 * It holds no rules. Whether the certificate is valid and whether a field may be blank are decided
 * behind `addToWaitingList`; the form only collects what an entry records.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
 * Every field the form submits, in the order it reads down the screen.
 *
 * Listed once and used three times — the blank state, the nine boxes of the grid, and the lookup
 * that marks them — because a field missing from any one of those three fails silently: an
 * un-listed field is simply not submitted, or not cleared, or not markable.
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
 * `<Label htmlFor>` + `<Input id>` rather than the control nested inside its label. The `id`s are
 * load-bearing anyway — `waiting-list.spec.ts` fills every field by CSS id, never by label — so the
 * binding costs nothing and makes the accessibility snapshot name each `textbox`, which is also
 * what `getByLabel` needs. The `id` is the `name`, which is also the path a refusal marks by, so all
 * three agree without a translation.
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

  // The one place on this screen where the viewport rule needs help. Nothing scrolls — measured,
  // `window.scrollY` is identical either side of the click — but the applicant who was just added
  // arrives as a *new row in the list above this form*, which pushes the form, its button and its
  // confirmation down by the height of that row. With the button near the bottom of the screen when
  // it was pressed, the answer lands just past it: 905px of a 900px viewport, measured on the demo
  // data.
  //
  // Asked rather than assumed, and only then: on any screen tall enough to hold the form the
  // confirmation is already in view, and scrolling a page that did not need it is its own way of
  // losing the reader. `block: "center"` rather than `"nearest"` because the row is inserted in the
  // same commit — `"nearest"` scrolls by the minimum the layout claims at that moment and left the
  // banner eight pixels clipped.
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
    // Named, so the button beside the heading can jump here. Staff arrive on this screen from
    // /kunden/neu's "stattdessen auf die Warteliste setzen" with a person standing in front of
    // them, and the form they were sent for is below the whole queue. `scroll-mt-16` clears the
    // sticky bar, which would otherwise cover this card's own heading on arrival.
    <Card id={ADD_FORM_ANCHOR} className="scroll-mt-16">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{de.waitingList.add.heading}</h2>
        </CardTitle>
        <CardDescription className="max-w-prose">{de.waitingList.add.hint}</CardDescription>
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
