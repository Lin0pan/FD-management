"use client";

/**
 * The campaign reminder's checkbox (US-40), one component at the counter and in the record so the
 * unticked state looks the same in both. Saved on change, no button; prominent when unticked but
 * never in the way of serving (D4). At the counter it is a tile among the mask's tiles (US-41.5).
 */

import { useActionState, useId, useOptimistic } from "react";
import { BellRing } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  tile = false,
}: {
  reminderId: number;
  customerId: number;
  /** DF's own name for the campaign — the checkbox's label. */
  name: string;
  /** As stored. A refused tick falls back to it, since nothing was revalidated. */
  received: boolean;
  /** The counter's shape: the name over the box, sized like the tiles beside it. */
  tile?: boolean;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    setCampaignReminderReceivedAction,
    initialRecordFormState,
  );
  const [shown, setShown] = useOptimistic(received);
  const fieldId = useId();
  // Only a refusal claims the board: the box itself is the receipt, and a successful tick should not
  // clear the hand-out's „Ausgabe erfasst.“ off the counter.
  const showing = useNoticeSlot("campaign-reminder", state.status === "error" ? state : null);

  const save = (formData: FormData): void => {
    setShown(formData.has("received"));
    formAction(formData);
  };
  const hidden = (
    <>
      <input type="hidden" name="reminderId" value={reminderId} />
      <input type="hidden" name="customerId" value={customerId} />
    </>
  );
  const box = (
    <input
      id={fieldId}
      type="checkbox"
      name="received"
      data-testid="campaign-reminder-received"
      checked={shown}
      disabled={pending}
      // React resets the form after its action, restoring a checkbox from `defaultChecked`
      // (`card-printed-field.tsx`): kept equal to what is shown, the reset changes nothing.
      ref={(node) => {
        if (node !== null) {
          node.defaultChecked = shown;
        }
      }}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={tile ? "size-[22px] accent-primary" : "size-5 accent-primary"}
    />
  );
  const outstanding = (className: string): React.ReactElement | null =>
    shown ? null : (
      <BellRing
        aria-hidden="true"
        data-testid="campaign-reminder-outstanding"
        className={className}
      />
    );
  const error =
    showing && state.status === "error" ? (
      <Notice tone={state.tier} text={state.message} testId="campaign-reminder-error" />
    ) : null;

  if (tile) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <form
          action={save}
          data-testid="campaign-reminder"
          className={cn(
            "flex flex-col gap-1 rounded-[10px] border px-3 py-1.5",
            // The border every tile wears, so the tiles end on one edge.
            shown ? "border-rule-subtle bg-muted" : CAMPAIGN_OUTSTANDING_ACCENT,
          )}
        >
          {hidden}
          <label
            htmlFor={fieldId}
            title={name}
            className="flex min-w-0 items-center gap-1.5 text-sm leading-snug text-muted-foreground"
          >
            {outstanding("size-3.5 shrink-0 text-foreground")}
            <span className="truncate">{name}</span>
          </label>
          {/* The figures beside it are `text-2xl`; this row is their line height, so the tiles end
              on one edge. */}
          <span className="flex h-8 items-center">{box}</span>
        </form>
        {error}
      </div>
    );
  }

  return (
    <Card
      data-testid="campaign-reminder"
      className={shown ? undefined : cn("border ring-0", CAMPAIGN_OUTSTANDING_ACCENT)}
    >
      <CardContent className="flex flex-col gap-3">
        <form action={save} className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {hidden}
          <div className="flex items-center gap-3">
            {box}
            <label htmlFor={fieldId} className="text-lg font-semibold">
              {name}
            </label>
            {outstanding("size-5")}
          </div>
        </form>
        {error}
      </CardContent>
    </Card>
  );
}
