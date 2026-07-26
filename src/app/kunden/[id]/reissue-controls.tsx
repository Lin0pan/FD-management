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
import { de } from "@/i18n/de";
import { reissueCardAction } from "./actions";
import { initialReissueState } from "./reissue-state";

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

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <details className="rounded border border-foreground/20">
        <summary data-testid="reissue-open" className="cursor-pointer px-4 py-2 font-medium">
          {de.customers.reissue.action}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p data-testid="reissue-confirm" className="max-w-prose">
            {de.customers.reissue.confirm(cardNumber, nextCardNumber)}
          </p>
          <button
            type="submit"
            disabled={pending}
            data-testid="reissue-submit"
            className="self-start rounded bg-foreground px-6 py-3 font-semibold text-background disabled:opacity-60"
          >
            {pending ? de.customers.reissue.submitting : de.customers.reissue.submit}
          </button>
          <span className="max-w-prose text-xs text-foreground/60">
            {de.customers.reissue.hint}
          </span>
        </div>
      </details>
      {state.status === "error" ? (
        <p
          role="status"
          data-testid="reissue-error"
          className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
