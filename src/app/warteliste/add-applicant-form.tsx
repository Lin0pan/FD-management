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
import { de } from "@/i18n/de";
import { addApplicantAction } from "./actions";
import { initialAddApplicantState } from "./waiting-list-state";

const fieldClass = "w-full rounded border border-foreground/20 bg-transparent px-2 py-1";

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
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input className={fieldClass} type={type} name={name} id={name} defaultValue="" />
    </label>
  );
}

function Fields(): React.ReactElement {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
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
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.waitingList.add.contactNoteLabel}</span>
        <input className={fieldClass} type="text" name="contactNote" id="contactNote" />
        <span className="text-xs text-foreground/60">{de.waitingList.add.contactNoteHint}</span>
      </label>
    </>
  );
}

export function AddApplicantForm(): React.ReactElement {
  const [state, action, pending] = useActionState(addApplicantAction, initialAddApplicantState);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-6">
      <h2 className="text-xl font-semibold">{de.waitingList.add.heading}</h2>
      <p className="max-w-prose text-sm text-foreground/70">{de.waitingList.add.hint}</p>

      <form action={action} className="flex flex-col gap-4">
        <Fields key={state.savedCount} />

        {state.status === "error" ? (
          <p
            role="status"
            data-testid="waiting-list-add-error"
            className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            {state.message}
          </p>
        ) : null}
        {state.status === "saved" ? (
          <p
            role="status"
            data-testid="waiting-list-add-saved"
            className="max-w-prose rounded border border-foreground/20 px-3 py-2"
          >
            {state.message}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={pending}
            data-testid="waiting-list-add-submit"
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
          >
            {pending ? de.waitingList.add.submitting : de.waitingList.add.submit}
          </button>
        </div>
      </form>
    </section>
  );
}
