"use client";

/**
 * Recording a renewed needs certificate from the customer record (US-16.5, FR-6) — the same use case
 * the counter calls (US-06.4), and therefore the same reset of the reminder count to zero.
 *
 * It uses the counter's words on purpose: a renewal recorded here and a renewal recorded at the
 * counter are the same event, and two dictionaries for it are two ways for the confirmation to
 * describe a different thing than happened. The confirmation names the reset explicitly, and the
 * reminder count beside it comes back as 0 from the revalidated record.
 *
 * Unlike at the counter it is always offered, not only while the certificate is expired: a household
 * that brings the renewal early should not have to be turned away first for the form to appear.
 *
 * The fields are **controlled**, and they live in a child of the keyed `<form>` rather than beside
 * the `useActionState` above it. That placement is the whole mechanism: a save changes the key, the
 * child is remounted, and `useState` re-initialises empty, so the next renewal does not start on the
 * values just filed; a refusal changes nothing, so what was typed is still there to be corrected.
 *
 * Putting the two `useState`s in `RenewalForm` itself looks equivalent and is not — the key is on an
 * element *below* that component, so remounting the form would leave the state above it untouched and
 * a saved renewal would sit in the fields afterwards. Measured exactly that way before the state moved
 * down. The rule: **state that a key is meant to clear must live under the key**, which is what
 * `warteliste/add-applicant-form.tsx` does with its `<Fields key={savedCount} />`.
 *
 * Uncontrolled, React's own post-action reset emptied them either way — a past `gültig bis` was
 * refused *and* deleted, along with the certificate type beside it, and the staff member retyped both
 * to change one digit. The same finding as on `/einstellungen`, on a different screen.
 */

import { useActionState, useRef, useState } from "react";
import { de } from "@/i18n/de";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { useFocusFirstRefusal } from "../../field-mark";
import { marking, problemAt } from "../../field-refusal";
import { renewCertificateAction } from "./actions";
import { FormFooter, GRID, RecordRejection, SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

/**
 * The two fields, holding the attempt in progress. Under the key, so a save empties them.
 *
 * The marks arrive as props rather than being read from the action state here, and that follows from
 * where this component sits: it is under the `key`, so it is remounted on every save, and reading
 * state it does not own would put the lookup on the wrong side of the remount. The values *must*
 * live here; the answer about them must not.
 */
function RenewalFields({
  typeProblem,
  validUntilProblem,
}: {
  typeProblem: string | null;
  validUntilProblem: string | null;
}): React.ReactElement {
  const [type, setType] = useState("");
  const [validUntil, setValidUntil] = useState("");

  return (
    <div className={GRID}>
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6">
        <label
          htmlFor="renewal-type-field"
          className={`text-sm font-medium ${typeProblem === null ? "" : "text-destructive"}`.trimEnd()}
        >
          {de.customers.fields.certificateType}
        </label>
        <Input
          id="renewal-type-field"
          type="text"
          name="certificateType"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
          data-testid="renewal-type"
          {...marking("certificateType", "renewal-type-field", typeProblem)}
        />
        {typeProblem === null ? null : (
          <RecordRejection id="renewal-type-field" problem={typeProblem} />
        )}
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6">
        <label
          htmlFor="renewal-valid-until-field"
          className={`text-sm font-medium ${validUntilProblem === null ? "" : "text-destructive"}`.trimEnd()}
        >
          {de.customers.fields.certificateValidUntil}
        </label>
        <DateInput
          id="renewal-valid-until-field"
          name="certificateValidUntil"
          required
          placeholder={de.day.placeholder}
          value={validUntil}
          onChange={setValidUntil}
          data-testid="renewal-valid-until"
          {...marking("certificateValidUntil", "renewal-valid-until-field", validUntilProblem)}
        />
        {validUntilProblem === null ? null : (
          <RecordRejection id="renewal-valid-until-field" problem={validUntilProblem} />
        )}
      </div>
    </div>
  );
}

export function RenewalForm({ customerId }: { customerId: number }): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    renewCertificateAction,
    initialRecordFormState,
  );
  const form = useRef<HTMLFormElement>(null);
  const words = de.distribution.certificate.renewal;

  const fields = state.status === "error" ? state.fields : undefined;
  useFocusFirstRefusal(fields, form);

  return (
    <form
      ref={form}
      key={state.status === "saved" ? state.saves : 0}
      action={formAction}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <h3 className="text-lg font-semibold">{words.heading}</h3>
      <p className="max-w-prose text-sm text-muted-foreground">{words.hint}</p>
      <RenewalFields
        typeProblem={problemAt(fields, "certificateType")}
        validUntilProblem={problemAt(fields, "certificateValidUntil")}
      />
      <FormFooter>
        <SaveButton label={words.submit} pending={pending} testId="renewal-save" />
        <SaveFeedback state={state} testId="renewal" savedText={words.saved} />
      </FormFooter>
    </form>
  );
}
