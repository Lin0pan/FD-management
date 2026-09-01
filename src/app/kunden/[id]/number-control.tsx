"use client";

/**
 * Moving a household from the customer number they hold to another free one (US-30).
 *
 * The number is the **slot** a household occupies in DF's register and the number printed on the
 * card they carry — never their identity (ADR-008) — and until US-30 it was fixed at registration
 * for good. DF's testing showed that is too rigid: a returning family wants the number their
 * neighbours know them by, a block of numbers is to be kept together, a number was typed in wrongly
 * and noticed a week later. None of those is a fault the software can detect and none of them needs
 * its opinion, so this control asks for **no reason** and offers no judgement — only the list of
 * slots that are free and what each one would print.
 *
 * It sits beside the group control rather than in „Aktionen mit Folgen“ because it is the same kind
 * of act: an administrative decision about the register, taken for DF's sake. What it *borrows* from
 * the danger zone is the confirmation — the move prints a card, and the card in the household's hand
 * stops being valid the moment it is saved.
 *
 * **The card number is never worked out here.** Every slot prints a different one, because the index
 * counts that slot's whole run including households since archived (US-25), and each choice arrives
 * from `listNumberChoices` with the number it would print already on it. A component that counted
 * would be a second answer to a question the register has already answered.
 *
 * The `<select>` is **controlled**, unlike the group radios beside it and for the two reasons the
 * registration form's is (US-24): the confirmation has to name the picked number's card while the
 * staff member is still deciding, and React resets a form once its action resolves — which restores
 * a `defaultValue` from the *attribute* the page was rendered with rather than from the revalidated
 * record. Held in state, the control comes back on the number that was just saved, with the slot it
 * vacated now among the choices.
 *
 * Nothing here is a guard. `changeCustomerNumber` decides whether the move may happen, re-reading
 * the quota as it does — a screen left open while staff lowered it (US-14) is offering slots that
 * are no longer slots, and only the use case can know that.
 */

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { NumberChoice } from "@/application/customers/list-number-choices";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
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
  choices,
}: {
  customerId: number;
  /** The slot the household holds today — where the dropdown opens, and what a move frees. */
  customerNumber: number;
  /**
   * Every slot they may be moved to, ascending, each with the card it would print. The household's
   * own number is always among them, which is what lets the control open on it.
   */
  choices: ReadonlyArray<NumberChoice>;
}): React.ReactElement {
  const [state, action, pending] = useActionState(
    changeCustomerNumberAction,
    initialNumberChangeState,
  );
  const showing = useNoticeSlot("number-change", state.status === "idle" ? null : state);
  const words = de.customers.numberChange;

  const [picked, setPicked] = useState<number | null>(null);

  // The list the dropdown offers: the register as the action re-read it after a lost race if it sent
  // one back, otherwise the reading the page was rendered with — the shape `/kunden/neu` uses for
  // the same control. Preferring the fresh list is what stops this going on offering a number that
  // provably cannot be saved.
  const offered = (state.status === "error" ? state.numberChoices : undefined) ?? choices;

  // What the control shows: the staff member's own pick, unless it has just been taken out of the
  // register — then the household's own number, which is where the dropdown opened and is the one
  // entry always on the list. Derived rather than stored, so the correction happens in the same
  // render the fresh list arrives in and no dead number is ever on screen.
  const chosen =
    picked !== null && offered.some((candidate) => candidate.number === picked)
      ? picked
      : customerNumber;

  // The choice the confirmation reads its card number off. `null` only if the household's own number
  // is missing from a list the server sent, which `listNumberChoices` does not do — found rather
  // than asserted, because a `!` here would be the file's way of being wrong silently.
  const choice = offered.find((candidate) => candidate.number === chosen) ?? null;

  // Free numbers, not choices: the household's own is on the list so the control can open on it, and
  // it is the one entry that is not free. At zero the count is replaced rather than shown, because
  // „Noch 0 freie Nummern“ states a shortage without saying what to do about it.
  const free = offered.length - 1;

  return (
    // Enter in the `<select>` would otherwise submit this form, and the submit it would reach is the
    // one *inside* the confirmation — so a stray keystroke while scrolling the list would print a
    // card without the sentence naming it ever having been on screen. That is precisely the save
    // `enter-guard.ts` exists to stop, on precisely the kind of control it names.
    <form action={action} onKeyDown={guardEnter} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerNumber" className="text-sm font-medium">
          {de.customers.fields.customerNumber}
        </label>
        {/* Native, like every other select in the app (`select.ts`): a Radix one submits nothing of
            its own, and a native one is type-ahead searchable over 240 options with no JavaScript of
            ours. Two of twelve columns is what a box holding at most three digits asks for — the
            width the same control has on `/kunden/neu`. */}
        <select
          className={`${SELECT} sm:w-32`}
          name="customerNumber"
          id="customerNumber"
          data-testid="number-change-select"
          value={chosen}
          onChange={(event) => setPicked(Number(event.target.value))}
        >
          {offered.map((candidate) => (
            <option key={candidate.number} value={candidate.number}>
              {candidate.number}
            </option>
          ))}
        </select>
      </div>
      {/* Never disabled when nothing else is free, and this line is why: a greyed-out dropdown says
          that something cannot be done and never why, and the reason is the only thing worth saying
          here — it names both ways another number becomes available. */}
      <p data-testid="number-change-count" className="max-w-prose text-xs text-muted-foreground">
        {free === 0 ? words.noOtherNumber : de.customers.assignment.freeNumberCount(free)}
      </p>
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
                <Sentence text={words.confirm(choice.number, choice.nextCardNumber)} />
              </AlertDescription>
            </Alert>
            <Button type="submit" disabled={pending} data-testid="number-change-submit">
              {pending ? words.submitting : words.submit}
            </Button>
          </div>
        </details>
      )}
      {/* The receipt, where the button was pressed. The record above re-renders the new number and
          the new card number from the revalidated read model — but the slot that was *freed* is
          named nowhere on it, and „did that save?“ is otherwise a question the screen answers only
          to somebody who remembers what it said before. */}
      {showing && state.status === "saved" ? (
        <Confirmation
          text={words.saved(state.from, state.to, state.cardNumber)}
          testId="number-change-saved"
        />
      ) : null}
      {showing && state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="number-change-error" />
      ) : null}
    </form>
  );
}
