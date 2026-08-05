"use client";

/**
 * The "Karte neu ausstellen (Verlust)" control, shown on the customer record and on the card view
 * (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3).
 *
 * A client component for the one reason the block controls are: `useActionState` reports a rejection
 * beside the button rather than on a page of its own.
 *
 * It holds no rules. The confirmation step is not a guard — `reissueCard` decides whether a card may
 * be issued — it is there because a reissue cannot be taken back and because the new number is what
 * staff copy onto the physical card: naming both numbers before the write is what lets them check
 * they are replacing the card actually in front of them. Neither number is worked out here; both
 * come off the read model.
 *
 * There is deliberately nothing that counts, compares or warns: how often a household has lost a
 * card is displayed on the card view and judged by staff, never by this button (§FR-4).
 */

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { reissueCardAction } from "./actions";
import { initialReissueState } from "./reissue-state";
import { Confirmation, Notice } from "../../notice";
import { useNoticeSlot } from "../../notice-board";

export function ReissueControls({
  customerId,
  cardNumber,
  nextCardNumber,
}: {
  customerId: number;
  /** The number the household holds today — the one the reissue makes invalid. */
  cardNumber: string;
  /** The number the reissue will hand out, from the read model rather than counted here. */
  nextCardNumber: string;
}): React.ReactElement {
  const [state, action, pending] = useActionState(reissueCardAction, initialReissueState);
  const showing = useNoticeSlot("reissue", state.status === "idle" ? null : state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <details>
        <summary
          data-testid="reissue-open"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          {de.customers.reissue.action}
        </summary>
        {/* Neutral, not destructive: a reissue hands out a new card, it does not take a household
            out of the register. Destructive is reserved for the block and the archive. */}
        <div className="mt-3 flex flex-col items-start gap-3">
          <Alert>
            <AlertDescription data-testid="reissue-confirm" className="max-w-prose">
              {de.customers.reissue.confirm(cardNumber, nextCardNumber)}
            </AlertDescription>
          </Alert>
          <Button type="submit" disabled={pending} data-testid="reissue-submit">
            {pending ? de.customers.reissue.submitting : de.customers.reissue.submit}
          </Button>
          <span className="max-w-prose text-xs text-muted-foreground">
            {de.customers.reissue.hint}
          </span>
        </div>
      </details>
      {/* The number again, after the write. The record and the card view both re-render it from the
          store, which is why this control had no confirmation at all — but a field further down the
          page changing from 1k1 to 1k2 is something staff would have to go and check, and this is
          the one they read where they clicked. */}
      {showing && state.status === "saved" ? (
        <Confirmation text={de.customers.reissue.saved(state.cardNumber)} testId="reissue-saved" />
      ) : null}
      {showing && state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="reissue-error" />
      ) : null}
    </form>
  );
}
