"use client";

/**
 * „Karte ist bereits gedruckt“ beside every manual issue (US-39.5), unticked by default (D2). Native
 * rather than Radix's, because the actions read it as presence in the `FormData`.
 */

import { useState } from "react";
import { de } from "@/i18n/de";
import { CARD_PRINTED_FIELD } from "./card-printed";

export function CardPrintedField({
  id,
  testId,
}: {
  id: string;
  testId: string;
}): React.ReactElement {
  const [checked, setChecked] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        name={CARD_PRINTED_FIELD}
        data-testid={testId}
        checked={checked}
        // React resets the form after its action, restoring a checkbox from `defaultChecked`: kept
        // equal to the state, a refused registration does not untick it. Remount with a `key` to clear.
        ref={(node) => {
          if (node !== null) {
            node.defaultChecked = checked;
          }
        }}
        onChange={(event) => setChecked(event.target.checked)}
        className="size-4 accent-primary"
      />
      <label htmlFor={id} className="text-sm">
        {de.cardsToPrint.alreadyPrinted}
      </label>
    </div>
  );
}
