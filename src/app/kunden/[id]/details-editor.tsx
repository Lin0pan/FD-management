"use client";

/**
 * Correcting who the customer is and where they live (US-16.2).
 *
 * A client component for one reason: `useActionState` reports the save or the refusal back beside
 * the fields. It holds no rules — the same domain factory that judged the registration judges this
 * (`createPersonalDetails`), so a correction cannot let through what an intake would refuse.
 *
 * **There is no customer-number field, and there is nowhere to add one**: the use case and the port
 * method behind this form take none (FR-7). A slot is assigned when a household joins the register
 * and released when they leave it.
 *
 * The customer's name also stands in their own household row, and the save carries it there in the
 * same transaction. That is stated in the hint above the fields rather than left for staff to
 * discover, because the alternative reading — that the household list has to be corrected as well —
 * is the one that produces two people where there was one.
 */

import { useActionState, useRef, useState } from "react";
import { de } from "@/i18n/de";
import { useFocusFirstRefusal } from "../../field-mark";
import { problemAt } from "../../field-refusal";
import { updateDetailsAction } from "./actions";
import { FormFooter, GRID, SaveButton, SaveFeedback, TextField } from "./record-forms";
import { initialRecordFormState } from "./record-state";

/** The personal data as the record holds it, every day already written as ISO by the server. */
export interface DetailsDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
}

export function DetailsEditor({
  customerId,
  details,
}: {
  customerId: number;
  details: DetailsDraft;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(updateDetailsAction, initialRecordFormState);
  const [draft, setDraft] = useState<DetailsDraft>(details);
  const form = useRef<HTMLFormElement>(null);

  const fields = state.status === "error" ? state.fields : undefined;
  const problem = (name: string): string | null => problemAt(fields, name);
  // Scoped to this form, because the record renders eight of them and this one holds a `firstName`
  // that the household table below also spells — as `householdMembers.0.firstName`, so the two do
  // not in fact collide today. The ref is what keeps that a fact about the paths rather than a thing
  // to remember when a ninth form arrives.
  useFocusFirstRefusal(fields, form);

  function set(patch: Partial<DetailsDraft>): void {
    setDraft({ ...draft, ...patch });
  }

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="max-w-prose text-sm text-muted-foreground">{de.customers.record.detailsHint}</p>

      <div className={GRID}>
        <TextField
          name="firstName"
          testId="details-first-name"
          label={de.customers.fields.firstName}
          value={draft.firstName}
          onChange={(firstName) => set({ firstName })}
          problem={problem("firstName")}
        />
        <TextField
          name="lastName"
          testId="details-last-name"
          label={de.customers.fields.lastName}
          value={draft.lastName}
          onChange={(lastName) => set({ lastName })}
          problem={problem("lastName")}
        />
        <TextField
          name="birthDate"
          testId="details-birth-date"
          type="date"
          label={de.customers.fields.birthDate}
          value={draft.birthDate}
          onChange={(birthDate) => set({ birthDate })}
          problem={problem("birthDate")}
        />
      </div>

      <h3 className="text-lg font-semibold">{de.customers.new.addressHeading}</h3>
      <div className={GRID}>
        <TextField
          name="street"
          span="sm:col-span-2 lg:col-span-6"
          testId="details-street"
          label={de.customers.fields.street}
          value={draft.street}
          onChange={(street) => set({ street })}
          problem={problem("street")}
        />
        <TextField
          name="houseNumber"
          span="lg:col-span-2"
          testId="details-house-number"
          label={de.customers.fields.houseNumber}
          value={draft.houseNumber}
          onChange={(houseNumber) => set({ houseNumber })}
          problem={problem("houseNumber")}
        />
        <TextField
          name="zip"
          span="lg:col-span-2"
          testId="details-zip"
          label={de.customers.fields.zip}
          value={draft.zip}
          onChange={(zip) => set({ zip })}
          problem={problem("zip")}
        />
        <TextField
          name="city"
          testId="details-city"
          label={de.customers.fields.city}
          value={draft.city}
          onChange={(city) => set({ city })}
          problem={problem("city")}
        />
      </div>

      <FormFooter>
        <SaveButton
          label={de.customers.record.detailsSubmit}
          pending={pending}
          testId="details-submit"
        />
        <SaveFeedback state={state} testId="details" />
      </FormFooter>
    </form>
  );
}
