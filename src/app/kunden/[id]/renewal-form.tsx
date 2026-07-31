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
 * The fields are uncontrolled and remounted by their key after a save, so the next renewal starts on
 * an empty form rather than on the values that were just filed.
 */

import { useActionState } from "react";
import { de } from "@/i18n/de";
import { Input } from "@/components/ui/input";
import { renewCertificateAction } from "./actions";
import { FormFooter, GRID, SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

export function RenewalForm({ customerId }: { customerId: number }): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    renewCertificateAction,
    initialRecordFormState,
  );
  const words = de.distribution.certificate.renewal;

  return (
    <form
      key={state.status === "saved" ? state.saves : 0}
      action={formAction}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <h3 className="text-lg font-semibold">{words.heading}</h3>
      <p className="max-w-prose text-sm text-muted-foreground">{words.hint}</p>
      <div className={GRID}>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6">
          <label htmlFor="renewal-type-field" className="text-sm font-medium">
            {de.customers.fields.certificateType}
          </label>
          <Input
            id="renewal-type-field"
            type="text"
            name="type"
            required
            data-testid="renewal-type"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6">
          <label htmlFor="renewal-valid-until-field" className="text-sm font-medium">
            {de.customers.fields.certificateValidUntil}
          </label>
          <Input
            id="renewal-valid-until-field"
            type="date"
            name="validUntil"
            required
            data-testid="renewal-valid-until"
          />
        </div>
      </div>
      <FormFooter>
        <SaveButton label={words.submit} pending={pending} testId="renewal-save" />
        <SaveFeedback state={state} testId="renewal" savedText={words.saved} />
      </FormFooter>
    </form>
  );
}
