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
import { renewCertificateAction } from "./actions";
import { fieldClass, SaveButton, SaveFeedback } from "./record-forms";
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
      <p className="max-w-prose text-sm text-foreground/70">{words.hint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.customers.fields.certificateType}</span>
          <input
            className={fieldClass}
            type="text"
            name="type"
            required
            data-testid="renewal-type"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">
            {de.customers.fields.certificateValidUntil}
          </span>
          <input
            className={fieldClass}
            type="date"
            name="validUntil"
            required
            data-testid="renewal-valid-until"
          />
        </label>
      </div>
      <SaveButton label={words.submit} pending={pending} testId="renewal-save" />
      <SaveFeedback state={state} testId="renewal" savedText={words.saved} />
    </form>
  );
}
