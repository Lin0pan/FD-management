"use client";

/**
 * Moving a household to another customer number, and with it to the other week (US-30, US-31.7).
 *
 * One question in two halves — the group, then the numbers it offers — exactly as the intake asks it
 * (`kunden/neu/registration-form.tsx`), because the number *is* the group (ADR-017). One act, one
 * confirmation and one card printed by it; nothing is validated, because nothing can disagree.
 *
 * The radios carry **no `name`**, so they are left out of the `FormData`: the group is browser state
 * rather than a second field somebody could contradict, and the form posts the number alone.
 *
 * **The card number is never worked out here.** Every slot prints a different one (US-25), and each
 * choice arrives from `listNumberChoices` with its own already on it — a component that counted, or
 * read parity for itself, would be a second answer to a settled question.
 *
 * The `<select>` is **controlled**, for the registration form's two reasons (US-24): the confirmation
 * names the picked number's card while the decision is still being made, and React resets a form once
 * its action resolves, restoring a `defaultValue` from the *attribute* rather than the revalidated
 * record.
 *
 * Nothing here is a guard — `changeCustomerNumber` decides, re-reading the quota as it does.
 */

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { NumberChoice } from "@/application/customers/list-number-choices";
import { GROUPS, groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { GROUP_STYLES } from "../../accents";
import { ControlSummary } from "../../disclosure";
import { guardEnter } from "../../enter-guard";
import { changeCustomerNumberAction } from "./actions";
import { initialNumberChangeState } from "./number-change-state";
import { Confirmation, Notice, Sentence } from "../../notice";
import { useNoticeSlot } from "../../notice-board";
import { selectClass } from "../../select";

const SELECT = selectClass("h-8");

export function NumberControl({
  customerId,
  customerNumber,
  groupCounts,
  choices,
}: {
  customerId: number;
  /** The slot the household holds today — where the dropdown opens, and what a move frees. */
  customerNumber: number;
  /** How many active households each week holds — beside the choice, because that is what the
   * decision is made of (FR-4). */
  groupCounts: GroupCounts;
  /**
   * Every slot they may be moved to, each with the card it would print. Their own number is always
   * among them, which is what lets the control open on it and keeps their group selectable.
   */
  choices: ReadonlyArray<NumberChoice>;
}): React.ReactElement {
  const [state, action, pending] = useActionState(
    changeCustomerNumberAction,
    initialNumberChangeState,
  );
  const showing = useNoticeSlot("number-change", state.status === "idle" ? null : state);
  const words = de.customers.numberChange;

  const ownGroup = groupOf(customerNumber);
  const [pickedGroup, setPickedGroup] = useState<Group>(ownGroup);
  const [picked, setPicked] = useState<number | null>(null);

  // The register as the action re-read it after a lost race, otherwise the reading the page was
  // rendered with — `/kunden/neu`'s shape. Preferring the fresh list is what stops this offering a
  // number that provably cannot be saved.
  const offered = (state.status === "error" ? state.numberChoices : undefined) ?? choices;

  // The one derivation the whole block reads from — the radios, the select and the figures beneath —
  // so the three cannot disagree.
  const choicesInGroup: Record<Group, ReadonlyArray<NumberChoice>> = {
    RED: offered.filter((candidate) => candidate.group === "RED"),
    BLUE: offered.filter((candidate) => candidate.group === "BLUE"),
  };

  // The staff member's own choice, unless a lost race has emptied it since: a group that can no
  // longer be chosen must not stay chosen, or the select would be an empty list under a checked
  // radio. Their own group always has something in it, so the fallback always lands.
  const group = choicesInGroup[pickedGroup].length > 0 ? pickedGroup : ownGroup;

  // What the confirmation reads its number, group and card off: the staff member's pick, unless the
  // group moved under it or a lost race took it out of the register — then their own slot where that
  // is one of this group's, and the group's lowest where it is not.
  //
  // `null` only if the group on screen has nothing at all, which the fallback above rules out. Found
  // rather than asserted: a `!` here would be this file's way of being wrong silently.
  const choice =
    choicesInGroup[group].find((candidate) => candidate.number === picked) ??
    choicesInGroup[group].find((candidate) => candidate.number === customerNumber) ??
    choicesInGroup[group].at(0) ??
    null;
  const chosen = choice?.number ?? customerNumber;

  // Free numbers, not choices: the household's own is on the list so the control can open on it, and
  // it is the one entry that is not free. Counted per week rather than totalled, because a week can
  // be full while the register is not — with a quota of 240 there are 120 even slots and 120 odd
  // ones, and either half can run out on its own.
  const freeInGroup: Record<Group, number> = {
    RED: choicesInGroup.RED.filter((candidate) => candidate.number !== customerNumber).length,
    BLUE: choicesInGroup.BLUE.filter((candidate) => candidate.number !== customerNumber).length,
  };

  return (
    // Enter in the `<select>` would otherwise submit this form, and the submit it would reach is the
    // one *inside* the confirmation — so a stray keystroke while scrolling the list would print a
    // card without the sentence naming it ever having been on screen. That is precisely the save
    // `enter-guard.ts` exists to stop, on precisely the kind of control it names. The radios are
    // covered by the same guard, and submit nothing of their own in any case.
    <form action={action} onKeyDown={guardEnter} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      {/*
       * The week, first, because it is the decision — the number under it is how the register
       * expresses it. Each option wears the colour it names and always carries the word: a colour
       * is a distinction only some of the staff can make (US-03.4).
       *
       * `#group-RED` is reached by CSS id in the e2e suite, and the ids are load-bearing anyway as
       * the target of `aria-describedby` on a group that is full.
       */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{de.customers.fields.group}</legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {GROUPS.map((option) => {
            // A week with nothing to offer cannot be chosen, and the sentence beside it says why.
            // Not an empty dropdown and not a refusal at save time: the register can be half free
            // and this half of it full, and this is where staff meet that. The only way through is
            // to raise the quota (US-14) — which the screen does not say, because raising it by one
            // may add a slot to the wrong parity and a sentence right half the time is worse than
            // none.
            //
            // The household's own week is never in this state: their own slot is on the list.
            const soldOut = choicesInGroup[option].length === 0;
            return (
              <div key={option} className="flex items-center gap-2">
                <label
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${GROUP_STYLES[option]} ${soldOut ? "opacity-60" : ""}`.trimEnd()}
                >
                  <input
                    type="radio"
                    id={`group-${option}`}
                    value={option}
                    checked={option === group}
                    // What keeps that `checked` standing through a refusal. React resets the form
                    // once its action resolves, and a reset restores a radio from its `checked`
                    // **attribute** — the one the server rendered — while the `checked` *prop* has
                    // not changed, so React repaints nothing and the dot silently rewinds under a
                    // list that is still filtered by the group staff picked. Keeping the default
                    // equal to the state makes the reset a no-op, which is the whole fix; the
                    // select gets it for free, because React syncs `defaultValue` and not
                    // `defaultChecked` (US-31.6 found this one screen over).
                    ref={(node) => {
                      if (node !== null) {
                        node.defaultChecked = option === group;
                      }
                    }}
                    disabled={soldOut}
                    aria-describedby={soldOut ? `group-${option}-full` : undefined}
                    onChange={() => {
                      setPickedGroup(option);
                      // Back to that week's own lowest, rather than keeping a number that belongs
                      // to the week they just left — it is not on the list any more, and the
                      // household's own number is never on the other one.
                      setPicked(null);
                    }}
                    className="accent-current"
                  />
                  <span>{de.customers.groups[option]}</span>
                </label>
                {soldOut ? (
                  <p
                    id={`group-${option}-full`}
                    className="max-w-prose text-xs text-muted-foreground"
                  >
                    {de.customers.assignment.groupFull(de.customers.groups[option])}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* The two sizes, whatever the register looks like: a staff member moving somebody to even
            the weeks out has to be able to see for themselves that they have drifted. No proposal
            beside them, unlike at the intake — there is nothing to recommend about a household that
            is already somewhere. */}
        <p data-testid="group-sizes" className="max-w-prose text-xs text-muted-foreground">
          {de.customers.assignment.groupSizes(groupCounts.red, groupCounts.blue)}
        </p>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerNumber" className="text-sm font-medium">
          {de.customers.fields.customerNumber}
        </label>
        {/* Native, like every other select in the app (`select.ts`): a Radix one submits nothing of
            its own, and a native one is type-ahead searchable over 240 options with no JavaScript of
            ours. A box holding at most three digits, at the width the same control has on
            `/kunden/neu` — the two are one decision made in two places, and they should look it. */}
        <select
          className={`${SELECT} sm:w-32`}
          name="customerNumber"
          id="customerNumber"
          data-testid="number-change-select"
          value={chosen}
          onChange={(event) => setPicked(Number(event.target.value))}
        >
          {choicesInGroup[group].map((candidate) => (
            <option key={candidate.number} value={candidate.number}>
              {candidate.number}
            </option>
          ))}
        </select>
        {/* Never disabled when nothing else is free, and this line is why: a greyed-out dropdown says
            that something cannot be done and never why, and the reason is the only thing worth saying
            here. Two figures rather than one total, because the week above can be full while the
            register is not — at zero everywhere the count is replaced, since „Noch frei — Rot: 0,
            Blau: 0“ states a shortage twice and says nothing about it. */}
        <p
          data-testid="free-numbers-by-group"
          className="max-w-prose text-xs text-muted-foreground"
        >
          {freeInGroup.RED + freeInGroup.BLUE === 0
            ? words.noOtherNumber
            : de.customers.assignment.freeNumbersByGroup(freeInGroup.RED, freeInGroup.BLUE)}
        </p>
      </div>
      {/* The two-step save, in the reissue's shape: a disclosure that reveals what is about to
          happen, and a submit inside it. It is offered only once a *different* number is picked —
          there is no move to confirm otherwise, and a button that opened onto „pick a number first“
          would be a step that exists to say it is not a step. Choosing the number they already hold
          is still refused by the use case, which is what a second tab reaches. */}
      {choice === null || chosen === customerNumber ? null : (
        <details className="group">
          <ControlSummary testId="number-change-open">{words.action}</ControlSummary>
          {/* Neutral, not destructive: a move hands out a new card and frees a slot, it does not
              take a household out of the register. Destructive is the block and the archive. */}
          <div className="mt-3 flex flex-col items-start gap-3">
            <Alert>
              <AlertDescription data-testid="number-change-confirm" className="max-w-prose">
                {/* All three values that will be copied onto the physical card, and the group
                    whether or not the parity changed — it is printed there too, so it is one of the
                    things being written out rather than a report of what the move did. */}
                <Sentence
                  text={words.confirm(
                    choice.number,
                    de.customers.groups[choice.group],
                    choice.nextCardNumber,
                  )}
                />
              </AlertDescription>
            </Alert>
            <Button type="submit" disabled={pending} data-testid="number-change-submit">
              {pending ? words.submitting : words.submit}
            </Button>
          </div>
        </details>
      )}
      {/* The receipt, where the button was pressed. The record above re-renders the new number, the
          new week and the new card number from the revalidated read model — but the slot that was
          *freed* is named nowhere on it, and „did that save?“ is otherwise a question the screen
          answers only to somebody who remembers what it said before.

          The group is read off the number the store came back with, through the same `groupOf` the
          read model uses. Nothing carries it back from the action, because there is nothing to
          carry: the number is the group. */}
      {showing && state.status === "saved" ? (
        <Confirmation
          text={words.saved(
            state.from,
            state.to,
            de.customers.groups[groupOf(state.to)],
            state.cardNumber,
          )}
          testId="number-change-saved"
        />
      ) : null}
      {showing && state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="number-change-error" />
      ) : null}
    </form>
  );
}
