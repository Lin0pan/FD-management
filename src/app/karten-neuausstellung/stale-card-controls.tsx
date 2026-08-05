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
import { Button, buttonVariants } from "@/components/ui/button";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { reissueStaleCardAction } from "./actions";
import { initialStaleReissueState } from "./reissue-state";
import { Notice } from "../notice";

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
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      {/* A real `<details>`, not a `Dialog`: the disclosure is a product decision (nothing may have
          to be dismissed before the rest of the list can be read) and a dialog would portal its
          contents out of the row. What changes is only its weight — closed it now reads as the
          control it is rather than as a collapsed section spanning the row. */}
      <details>
        <summary
          data-testid="stale-reissue-open"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          {de.cardsDue.action}
        </summary>
        <div className="mt-3 flex flex-col items-start gap-3">
          <p data-testid="stale-reissue-confirm" className="max-w-prose">
            {de.customers.reissue.confirm(cardNumber, nextCardNumber)}
          </p>
          <Button type="submit" disabled={pending} data-testid="stale-reissue-submit">
            {pending ? de.customers.reissue.submitting : de.customers.reissue.submit}
          </Button>
        </div>
      </details>
      {state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="stale-reissue-error" />
      ) : null}
    </form>
  );
}
