"use client";

/**
 * Moving a household between the RED and BLUE halves of the distribution cycle (US-16.4).
 *
 * The two group sizes stand beside the choice because that is what the decision is made of: staff
 * move somebody *in order to* even the register out, and a control that made them fetch the balance
 * from another screen first would be a control they used blind (FR-4). The numbers are the record's
 * own read, so they are as fresh as the page.
 *
 * The hint states the two consequences, because neither is visible here: the move applies to a
 * distribution the same afternoon, and the card the household is carrying still names the old group,
 * which puts them on the cards-due list. Both are derived on the next read — there is nothing to
 * enqueue and nothing to remember.
 *
 * Choosing the group they are already in is refused by `changeGroup` as a no-op; the radio simply
 * starts on it, so pressing save without choosing is the ordinary way to hit that.
 *
 * The radios are **uncontrolled**, unlike every other field on this record. React resets a form
 * after its action resolves, and a reset restores each radio from its `checked` *attribute* rather
 * than from the property React set — so a controlled radio comes back showing the group the
 * household was in before the move, silently disagreeing with the two sizes beside it. Rendering
 * `defaultChecked` from the record makes that reset restore the truth instead: the attribute is
 * rewritten by the revalidated render, which knows where the household now is.
 */

import { useActionState } from "react";
import { GROUPS, type Group } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { GROUP_STYLES } from "../../accents";
import { changeGroupAction } from "./actions";
import { FormFooter, SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

export function GroupControl({
  customerId,
  group,
  counts,
}: {
  customerId: number;
  /** The group the household is in today — where the radio starts. */
  group: Group;
  /** How many active households each group holds, counted by the record's read. */
  counts: { readonly red: number; readonly blue: number };
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(changeGroupAction, initialRecordFormState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{de.customers.fields.group}</legend>
        {/* Each option wears the colour it names: RED and BLUE *are* the printed cards DF hands
            out, and the word stays inside the tint rather than being replaced by it (US-03.4). */}
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((candidate) => (
            <label
              key={candidate}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${GROUP_STYLES[candidate]}`}
            >
              <input
                type="radio"
                name="group"
                value={candidate}
                data-testid={`group-${candidate}`}
                defaultChecked={candidate === group}
                className="accent-current"
              />
              <span>{de.customers.groups[candidate]}</span>
            </label>
          ))}
        </div>
        <p data-testid="group-sizes" className="text-sm text-muted-foreground">
          {de.customers.record.groupSizes(counts.red, counts.blue)}
        </p>
      </fieldset>
      <p className="max-w-prose text-sm text-muted-foreground">{de.customers.record.groupHint}</p>
      <FormFooter>
        <SaveButton
          label={de.customers.record.groupSubmit}
          pending={pending}
          testId="group-submit"
        />
        <SaveFeedback state={state} testId="group" />
      </FormFooter>
    </form>
  );
}
