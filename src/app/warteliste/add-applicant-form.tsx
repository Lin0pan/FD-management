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
 * It holds no rules. Whether the certificate is valid and whether a field may be blank are decided
 * behind `addToWaitingList`; the form only collects what an entry records.
 */

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { de } from "@/i18n/de";
import { addApplicantAction } from "./actions";
import { ADD_FORM_ANCHOR } from "./add-form-anchor";
import { initialAddApplicantState } from "./waiting-list-state";
import { Notice } from "../notice";

/**
 * `<Label htmlFor>` + `<Input id>` rather than the control nested inside its label. The `id`s are
 * load-bearing anyway — `waiting-list.spec.ts` fills every field by CSS id, never by label — so the
 * binding costs nothing and makes the accessibility snapshot name each `textbox`, which is also
 * what `getByLabel` needs.
 */
function Field({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: "text" | "date";
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input type={type} name={name} id={name} defaultValue="" />
    </div>
  );
}

function Fields(): React.ReactElement {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="firstName" label={de.customers.fields.firstName} />
        <Field name="lastName" label={de.customers.fields.lastName} />
        <Field name="birthDate" label={de.customers.fields.birthDate} type="date" />
        <Field name="street" label={de.customers.fields.street} />
        <Field name="houseNumber" label={de.customers.fields.houseNumber} />
        <Field name="zip" label={de.customers.fields.zip} />
        <Field name="city" label={de.customers.fields.city} />
        <Field name="certificateType" label={de.customers.fields.certificateType} />
        <Field
          name="certificateValidUntil"
          label={de.customers.fields.certificateValidUntil}
          type="date"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="contactNote">{de.waitingList.add.contactNoteLabel}</Label>
        <Input type="text" name="contactNote" id="contactNote" />
        <span className="text-xs text-muted-foreground">{de.waitingList.add.contactNoteHint}</span>
      </div>
    </>
  );
}

export function AddApplicantForm(): React.ReactElement {
  const [state, action, pending] = useActionState(addApplicantAction, initialAddApplicantState);
  const answer = useRef<HTMLDivElement>(null);

  // The one place on this screen where the viewport rule needs help. Nothing scrolls — measured,
  // `window.scrollY` is identical either side of the click — but the applicant who was just added
  // arrives as a *new row in the list above this form*, which pushes the form, its button and its
  // confirmation down by the height of that row. With the button near the bottom of the screen when
  // it was pressed, the answer lands just past it: 905px of a 900px viewport, measured on the demo
  // data (`docs/ui_action_feedback_review.md` §3.3).
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
        <form action={action} className="flex flex-col gap-4">
          {/* The remount that clears the form for the next applicant. It keys on how many have been
              saved, not on the message, so a second applicant of the same name still resets it. */}
          <Fields key={state.savedCount} />

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
