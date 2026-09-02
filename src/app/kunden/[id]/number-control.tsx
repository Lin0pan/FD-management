"use client";

/**
 * Moving a household to another customer number, and with it to the other week (US-30, US-31.7).
 *
 * The number is the **slot** a household occupies in DF's register and the number printed on the
 * card they carry — never their identity (ADR-008) — and since US-31 it is also what says which week
 * they collect in: even is BLUE, odd is RED (`groupOf`). So this control asks one question in two
 * halves, group first and then the numbers that group offers, exactly as the intake asks it
 * (`kunden/neu/registration-form.tsx`). Staff meet one shape for one decision in both places they
 * make it, and the group is the half they actually decide — the number is administrative.
 *
 * There were two sections here until US-31: a group choice above a number choice, each with its own
 * save. Moving a household between the weeks now *is* moving them to a number of the other parity,
 * so there is one act, one confirmation and one card printed by it. Nothing is validated, because
 * nothing can disagree: the form posts the number alone and the group follows from it.
 *
 * The radios carry **no `name`** for that reason. An unnamed control is left out of the `FormData`,
 * which is what makes the group browser state rather than a second field somebody could contradict;
 * mutual exclusion is React's, off `checked`.
 *
 * It sits where „Gruppe“ sat rather than in „Aktionen mit Folgen“ because it is the same kind of
 * act: an administrative decision about the register, taken for DF's sake. What it *borrows* from
 * the danger zone is the confirmation — the move prints a card, and the card in the household's hand
 * stops being valid the moment it is saved.
 *
 * **The card number is never worked out here.** Every slot prints a different one, because the index
 * counts that slot's whole run including households since archived (US-25), and each choice arrives
 * from `listNumberChoices` with the number it would print and the group it belongs to already on it.
 * A component that counted, or that read parity for itself, would be a second answer to a question
 * the register has already answered.
 *
 * The `<select>` is **controlled**, for the two reasons the registration form's is (US-24): the
 * confirmation has to name the picked number's card while the staff member is still deciding, and
 * React resets a form once its action resolves — which restores a `defaultValue` from the *attribute*
 * the page was rendered with rather than from the revalidated record. Held in state, the control
 * comes back on the number that was just saved, with the slot it vacated now among the choices.
 *
 * Nothing here is a guard. `changeCustomerNumber` decides whether the move may happen, re-reading
 * the quota as it does — a screen left open while staff lowered it (US-14) is offering slots that
 * are no longer slots, and only the use case can know that.
 */

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { NumberChoice } from "@/application/customers/list-number-choices";
import { GROUPS, groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { GROUP_STYLES } from "../../accents";
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
  /**
   * How many active households each week holds, counted off the numbers they hold. Beside the
   * choice because that is what the decision is made of (FR-4).
   */
  groupCounts: GroupCounts;
  /**
   * Every slot they may be moved to, ascending, each with the card it would print and the week it
   * collects in. The household's own number is always among them, which is what lets the control
   * open on it — and what keeps their own group selectable however full the register is.
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

  // The list the dropdown offers: the register as the action re-read it after a lost race if it sent
  // one back, otherwise the reading the page was rendered with — the shape `/kunden/neu` uses for
  // the same control. Preferring the fresh list is what stops this going on offering a number that
  // provably cannot be saved.
  const offered = (state.status === "error" ? state.numberChoices : undefined) ?? choices;

  // What the offer leaves each week — the one derivation the whole block reads from: the radios take
  // whether a group has anything to offer, the select takes its options, and the figures beneath take
  // their two counts. Split here rather than at each of them, so the three cannot disagree.
  const choicesInGroup: Record<Group, ReadonlyArray<NumberChoice>> = {
    RED: offered.filter((candidate) => candidate.group === "RED"),
    BLUE: offered.filter((candidate) => candidate.group === "BLUE"),
  };

  // The group the controls stand on: the staff member's own choice, unless a lost race has emptied
  // it since — a group that can no longer be chosen must not stay chosen either, or the select below
  // would be an empty list under a checked radio. Their own group always has something in it, so
  // this fallback always lands somewhere: they are standing in it.
  const group = choicesInGroup[pickedGroup].length > 0 ? pickedGroup : ownGroup;

  // The choice the confirmation reads its number, group and card off: the staff member's own pick,
  // unless the group moved under it or a lost race has just taken it out of the register. Then the
  // household's own slot where that is one of this group's — it is where the dropdown opened — and
  // the group's lowest where it is not, because their own number is never in the other week.
  //
  // `null` only if the group on screen has nothing at all, which the fallback above rules out —
  // found rather than asserted, because a `!` here would be the file's way of being wrong silently.
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
        <details>
          <summary
            data-testid="number-change-open"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
            )}
          >
            {words.action}
          </summary>
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
