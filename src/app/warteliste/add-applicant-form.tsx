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

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
            <Notice tone="error" text={state.message} testId="waiting-list-add-error" />
          ) : null}
          {state.status === "saved" ? (
            <Alert role="status">
              <AlertDescription data-testid="waiting-list-add-saved" className="max-w-prose">
                {state.message}
              </AlertDescription>
            </Alert>
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
