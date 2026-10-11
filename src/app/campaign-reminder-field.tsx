"use client";

/**
 * The campaign reminder's checkbox (US-40), one component at the counter and in the record so the
 * unticked state looks the same in both. Saved on change, no button; prominent when unticked but
 * never in the way of serving (D4).
 */

import { useActionState, useId, useOptimistic } from "react";
import { Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { CAMPAIGN_OUTSTANDING_ACCENT } from "./accents";
import { setCampaignReminderReceivedAction } from "./kunden/[id]/actions";
import { initialRecordFormState } from "./kunden/[id]/record-state";
import { Notice } from "./notice";
import { useNoticeSlot } from "./notice-board";

export function CampaignReminderField({
  reminderId,
  customerId,
  name,
  received,
}: {
  reminderId: number;
  customerId: number;
  /** DF's own name for the campaign — the checkbox's label. */
  name: string;
  /** As stored. A refused tick falls back to it, since nothing was revalidated. */
  received: boolean;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    setCampaignReminderReceivedAction,
    initialRecordFormState,
  );
  const [shown, setShown] = useOptimistic(received);
  const fieldId = useId();
  const wordId = useId();
  // Only a refusal claims the board: the box itself is the receipt, and a successful tick should not
  // clear the hand-out's „Ausgabe erfasst.“ off the counter.
  const showing = useNoticeSlot("campaign-reminder", state.status === "error" ? state : null);

  return (
    <Card
      data-testid="campaign-reminder"
      className={shown ? undefined : cn("border ring-0", CAMPAIGN_OUTSTANDING_ACCENT)}
    >
      <CardContent className="flex flex-col gap-3">
        <form
          action={(formData: FormData) => {
            setShown(formData.has("received"));
            formAction(formData);
          }}
          className="flex flex-wrap items-center gap-x-6 gap-y-2"
        >
          <input type="hidden" name="reminderId" value={reminderId} />
          <input type="hidden" name="customerId" value={customerId} />
          <div className="flex items-center gap-3">
            <input
              id={fieldId}
              type="checkbox"
              name="received"
              data-testid="campaign-reminder-received"
              checked={shown}
              disabled={pending}
              aria-describedby={wordId}
              // React resets the form after its action, restoring a checkbox from `defaultChecked`
              // (`card-printed-field.tsx`): kept equal to what is shown, the reset changes nothing.
              ref={(node) => {
                if (node !== null) {
                  node.defaultChecked = shown;
                }
              }}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="size-5 accent-primary"
            />
            <label htmlFor={fieldId} className="text-lg font-semibold">
              {name}
            </label>
          </div>
          {shown ? (
            <span id={wordId} className="text-sm text-muted-foreground">
              {de.campaignReminder.received}
            </span>
          ) : (
            <span
              id={wordId}
              data-testid="campaign-reminder-outstanding"
              className="flex items-center gap-1.5 font-medium"
            >
              <Gift aria-hidden="true" className="size-4" />
              {de.campaignReminder.outstanding}
            </span>
          )}
        </form>
        {showing && state.status === "error" ? (
          <Notice tone={state.tier} text={state.message} testId="campaign-reminder-error" />
        ) : null}
      </CardContent>
    </Card>
  );
}
