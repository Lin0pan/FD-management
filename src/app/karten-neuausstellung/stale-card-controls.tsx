"use client";

/**
 * A row's "Karte neu ausstellen" control (tasks/prd-us-13-age-13-reclassification.md §US-13.4).
 *
 * A client component for the one reason the other write controls are: `useActionState` reports a
 * rejection beside the button that caused it rather than on a page of its own.
 *
 * It is a closed disclosure with the confirmation inside it, like the reissue control on the customer
 * record — and for the same two reasons. A reissue cannot be taken back, and the new number is what
 * staff copy onto the physical card, so both numbers are named before anything is written. Neither is
 * worked out here; both come off the read model.
 *
 * It holds no rules whatever: nothing is counted, compared or judged, and there is no state in which
 * the button is hidden. What put the household on this list was decided by `listCardsDueForReissue`.
 */

import { useActionState } from "react";
import { de } from "@/i18n/de";
import { reissueStaleCardAction } from "./actions";
import { initialStaleReissueState } from "./reissue-state";

export function StaleCardControls({
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
  const [state, action, pending] = useActionState(reissueStaleCardAction, initialStaleReissueState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <details className="rounded border border-foreground/20">
        <summary data-testid="stale-reissue-open" className="cursor-pointer px-4 py-2 font-medium">
          {de.cardsDue.action}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p data-testid="stale-reissue-confirm" className="max-w-prose">
            {de.customers.reissue.confirm(cardNumber, nextCardNumber)}
          </p>
          <button
            type="submit"
            disabled={pending}
            data-testid="stale-reissue-submit"
            className="self-start rounded bg-foreground px-6 py-3 font-semibold text-background disabled:opacity-60"
          >
            {pending ? de.customers.reissue.submitting : de.customers.reissue.submit}
          </button>
        </div>
      </details>
      {state.status === "error" ? (
        <p
          role="status"
          data-testid="stale-reissue-error"
          className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
