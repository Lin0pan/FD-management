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
 * The fields are **controlled**, and remounted by their key after a save. The two together are what
 * makes the form behave differently in the two cases it has to tell apart: a save remounts, so the
 * next renewal starts empty rather than on the values just filed; a refusal does not, so what was
 * typed is still there to be corrected. Uncontrolled, React's own post-action reset emptied them
 * either way — a past `gültig bis` was refused *and* deleted, along with the certificate type beside
 * it, and the staff member retyped both to change one digit
 * (`docs/ui_redesign_einstellungen.md` §4.2d, which is the same finding on the settings screen).
 */

import { useActionState, useState } from "react";
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
  // Initialised empty and re-initialised by the remount on `saves`, so these hold the current
  // attempt and nothing else.
  const [type, setType] = useState("");
  const [validUntil, setValidUntil] = useState("");

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
            value={type}
            onChange={(event) => setType(event.target.value)}
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
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
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
