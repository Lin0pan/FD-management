"use client";

/**
 * The counter's write controls — recording a hand-out, and correcting the one made today
 * (tasks/prd-us-05-record-attendance.md §US-05.4, tasks/prd-us-29-customer-balance.md §US-29.7).
 *
 * A client component only because two things need to happen in the browser: `useActionState` reports
 * a rejection back beside the button, and after a successful hand-out the number field is cleared for
 * the next customer. It holds no rules — whether this customer may be served, whether a record may
 * still be changed, and whether an amount above the one asked for needs confirming are all decided
 * behind `recordServe` and `correctServe`; this file only lays out the controls and repeats the
 * server's answer.
 *
 * Which of the two it shows is a property of the day, not a click: a customer with no record today
 * gets the serve action, and one already served gets that record with the controls to amend or remove
 * it. The page decides by passing `todaysRecord`; once a hand-out is recorded the page revalidates and
 * this switches to the correction view on its own.
 *
 * **The transaction is one number, and the screen states it three times over.** What to collect (`Zu
 * zahlen`), where the household stands (`Saldo`), and what was actually handed over (the Betrag
 * field, pre-filled with the first). A hand-out is confirming the figure; a part payment is typing
 * over it; and an amount above it is a question the server asks before anything is written.
 */

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { balanceKind } from "@/domain/distribution/balance";
import { formatEuroAmount, formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { correctServe, recordServe } from "./actions";
import { initialCorrectState, initialServeState } from "./serve-state";
import type { CorrectState, ServeState } from "./serve-state";
import { guardEnter } from "../enter-guard";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";
import { Stat } from "../stat";

/** Today's record as the controls need it — serialisable, with the time already in German. */
export interface TodaysRecordProps {
  readonly recordId: number;
  readonly time: string;
  /** What the household handed over. The correction field opens on it, unchanged. */
  readonly paidCents: number;
  /** What the counter asked for on the day this record was made — the figure it is judged against. */
  readonly askedCents: number;
  /** Where the household's balance would stand if this record were removed, so the warning says so. */
  readonly balanceWithoutRecordCents: number;
}

/**
 * The two figures the transaction turns on, in a grid of their own above the form.
 *
 * Separate from the four derived tiles on the card above — Erwachsene, Kinder, Eier, Preis — and
 * deliberately not a fifth and sixth of them. Those four say what the household draws this week;
 * these two say what changes hands, which is a different question and is asked at a different
 * moment. Keeping them apart is also what leaves the price in the fourth slot, where a staff
 * member's eye already goes for it.
 *
 * `Zu zahlen` is sized like the Kundennummer/Kartennummer pair rather than like a derived tile: it
 * is the number the transaction turns on, and it is read across a table. `Saldo` is a phrase and not
 * a figure, so it takes the smaller size a phrase needs — and it is **worded, never signed**
 * („Guthaben 2,00 €“, „Offen 2,00 €“, „ausgeglichen“), chosen on the domain's own `balanceKind`
 * rather than on a comparison written here.
 *
 * The grid is the counts row's own, verbatim, for the reason the Kundennummer pair shares it: the
 * card above and this one are the same width with the same padding, so four tracks put `Zu zahlen`
 * on the same baseline as `Erwachsene` and the two cards read as one column rhythm rather than two
 * that miss each other. `Saldo` spans the second and third of them because its value is a phrase and
 * not a figure: „Guthaben 100,00 €“ wants the width to stay on one line. It is allowed to wrap all
 * the same — below `sm` the row drops to two columns, where a tile is 160px and a nowrap would run
 * the words out through the tile's own padding.
 */
function PaymentRow({
  amountToPayCents,
  balanceCents,
}: {
  /** `null` for a household already served today: there is no second hand-out to collect for. */
  amountToPayCents: number | null;
  balanceCents: number;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {amountToPayCents === null ? null : (
        <Stat
          label={de.customers.derived.amountToPay}
          value={formatEuros(amountToPayCents)}
          testId="counter-amount-to-pay"
          valueClassName="text-4xl"
        />
      )}
      <Stat
        label={de.customers.derived.balance}
        value={de.customers.derived.balanceValue(balanceKind(balanceCents), balanceCents)}
        testId="counter-balance"
        className="sm:col-span-2"
        valueClassName="text-2xl"
      />
    </div>
  );
}

/**
 * The Betrag field: what was actually handed over, in the German amount form `formatEuroAmount`
 * writes and `parseEuros` reads back — `4,00`, with no currency symbol, which is the pair those two
 * functions exist to be.
 *
 * Pre-filled, because confirming the stated figure is the ordinary case and a queue is waiting; and
 * `select`ed on focus, so typing a different amount costs no deletion. `inputMode="decimal"` asks a
 * touch keyboard for digits and a comma without making this a `type="number"`, whose spinner and
 * locale-dependent decimal separator would both be wrong here.
 *
 * A native `<label htmlFor>` pair rather than a placeholder: the accessibility snapshot has to show a
 * *named* textbox, and a placeholder disappears the moment somebody types.
 *
 * **Keyed on `defaultCents` by every caller, and that is load-bearing.** React resets an uncontrolled
 * form once its action resolves, so after the server refuses an unconfirmed overpayment the field
 * would snap back to the amount that was asked for while the question beside it still named the
 * amount that was typed — and the confirm button would then book the wrong number. Re-keying mounts
 * a fresh input on the refused amount, so what the question says and what the second submission
 * carries cannot drift apart.
 */
function AmountField({
  defaultCents,
  testId,
}: {
  defaultCents: number;
  testId: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{de.distribution.serve.amount}</Label>
      <Input
        type="text"
        name="betrag"
        id={testId}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={formatEuroAmount(defaultCents)}
        onFocus={(event) => event.currentTarget.select()}
        data-testid={testId}
        className="h-12 w-32 text-2xl tabular-nums md:text-2xl"
      />
    </div>
  );
}

/**
 * The question an amount above the one asked for raises, and the button that answers it.
 *
 * **Not a modal, and nothing to dismiss.** At the counter the queue is waiting, so a staff member
 * who typed the wrong amount corrects the field and presses the ordinary button again — the question
 * simply stops being asked. That is the same reasoning the removal's inline `<details>` follows.
 *
 * The confirm button is a second submit *inside the same form*, so pressing it re-sends the amount
 * still standing in the field together with `overpaymentConfirmed`. The screen therefore never
 * decides that a payment is an overpayment; it repeats a question the use case asked (FR-8).
 */
function OverpaymentQuestion({
  state,
  disabled,
  testId,
}: {
  state: { readonly paidCents: number; readonly amountToPayCents: number };
  disabled: boolean;
  testId: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-start gap-2">
      <Notice
        tone="refusal"
        text={de.distribution.serve.overpayment.question(state.paidCents, state.amountToPayCents)}
        testId="serve-error"
      />
      <Button
        type="submit"
        name="overpaymentConfirmed"
        value="1"
        variant="outline"
        disabled={disabled}
        data-testid={testId}
        className="h-9"
      >
        {de.distribution.serve.overpayment.confirm}
      </Button>
    </div>
  );
}

/** Whether this state is the overpayment question, narrowed for the two forms that render it. */
function overpaymentIn(
  state: ServeState | CorrectState,
): { readonly paidCents: number; readonly amountToPayCents: number } | null {
  return state.status === "confirmOverpayment" ? state : null;
}

export function ServeControls({
  customerId,
  canServe,
  amountToPayCents,
  balanceCents,
  todaysRecord,
  lookedUpNumber,
}: {
  customerId: number;
  canServe: boolean;
  /**
   * What to collect today, derived by `lookupCustomer` from the household's whole hand-out history.
   * Shown, and used to pre-fill the field, only while there is a hand-out still to record.
   */
  amountToPayCents: number;
  /** The household's balance as it stands now — today's payment included once one is recorded. */
  balanceCents: number;
  todaysRecord: TodaysRecordProps | null;
  /**
   * What was typed into the counter's field to reach this household, submitted with a removal so the
   * redirect that carries its confirmation comes back to the same lookup rather than an empty field.
   */
  lookedUpNumber: string;
}): React.ReactElement | null {
  const [serveState, serve, serving] = useActionState(recordServe, initialServeState);
  const [correctState, correct, correcting] = useActionState(correctServe, initialCorrectState);
  // Two slots, not one: a hand-out and a correction to it are two answers that can both be sitting
  // in this component's state at once, and they share a test id because only one of them is ever the
  // current one. The board is what makes that true rather than merely intended.
  const showingServe = useNoticeSlot("serve", serveState.status === "idle" ? null : serveState);
  const showingCorrect = useNoticeSlot(
    "correct",
    correctState.status === "idle" ? null : correctState,
  );

  // Once the hand-out is stored, empty the number field so no stale number is waiting when staff
  // scroll back up to it (US-05.4). The input lives in the page's lookup form; reaching it by id is
  // the one seam between the two.
  //
  // Deliberately *not* focused as well. `focus()` scrolls its element into view, and the field sits
  // two screens above the confirmation this component just rendered — so re-focusing it threw the
  // viewport off the very answer the click had asked for, and left the cursor in a field the staff
  // member could no longer see. The confirmation is read where the button was pressed; the next
  // number is typed after scrolling back to the field, in sight of it.
  useEffect(() => {
    if (serveState.status === "recorded") {
      const input = document.getElementById("counter-input");
      if (input instanceof HTMLInputElement) {
        input.value = "";
      }
    }
  }, [serveState]);

  if (todaysRecord !== null) {
    const correctOverpayment = showingCorrect ? overpaymentIn(correctState) : null;
    const typedCents = correctOverpayment?.paidCents ?? todaysRecord.paidCents;

    return (
      <Card data-testid="already-served">
        <CardHeader>
          {/* The time and the amount stay one sentence in one element — it is read as one fact, and
              the e2e asserts both halves against it. */}
          <CardTitle className="text-xl">
            <h2 data-testid="already-served-message">
              {de.distribution.serve.alreadyServed(
                todaysRecord.time,
                todaysRecord.paidCents,
                todaysRecord.askedCents,
              )}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* No `Zu zahlen` here: this household has collected, and the figure `lookupCustomer`
              would state is what they would be asked for on a *second* hand-out today, which is not
              a thing that can happen. The balance stays, because it has just moved. */}
          <PaymentRow amountToPayCents={null} balanceCents={balanceCents} />

          {showingServe && serveState.status === "recorded" ? (
            <Confirmation
              text={de.distribution.serve.confirmed(serveState.at)}
              testId="serve-confirmation"
            />
          ) : null}

          {/* `guardEnter`: this form saves money on a screen a queue is standing at, so Enter in the
              Betrag field must not submit it (`enter-guard.ts`). The counter's *lookup* form is a
              different form and keeps its Enter. */}
          <form action={correct} onKeyDown={guardEnter} className="flex flex-col gap-3">
            <input type="hidden" name="recordId" value={todaysRecord.recordId} />
            <input type="hidden" name="nummer" value={lookedUpNumber} />
            <h3 className="font-heading text-base font-medium">
              {de.distribution.serve.correct.heading}
            </h3>
            {/* What was asked for on this record's own day, stated above the field so the amount in
                it can be read against something. Not today's amount to pay: that figure already has
                this record's own payment folded into it. */}
            <p data-testid="correct-asked" className="text-sm text-muted-foreground">
              {de.distribution.serve.asked(todaysRecord.askedCents)}
            </p>
            <AmountField key={typedCents} defaultCents={typedCents} testId="correct-amount" />
            <div className="flex flex-wrap items-start gap-3">
              <Button
                type="submit"
                name="action"
                value="SET_PAYMENT"
                variant="outline"
                disabled={correcting}
                data-testid="correct-save"
                className="h-9"
              >
                {de.distribution.serve.correct.save}
              </Button>
              {/* The confirmation step before a removal: the summary reveals the warning and the one
                  button that actually deletes, so no single click can drop a record. A native
                  `<details>` rather than a dialog — at the counter the queue is waiting, and nothing
                  here may have to be dismissed before the next customer can be served. */}
              <details className="rounded-lg border border-destructive/40">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-destructive">
                  {de.distribution.serve.correct.remove}
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3">
                  <p
                    data-testid="correct-remove-warning"
                    className="max-w-prose text-sm text-muted-foreground"
                  >
                    {de.distribution.serve.correct.removeConfirm(
                      todaysRecord.balanceWithoutRecordCents,
                    )}
                  </p>
                  <Button
                    type="submit"
                    name="action"
                    value="REMOVE"
                    variant="destructive"
                    disabled={correcting}
                    data-testid="correct-remove"
                    className="h-9 self-start"
                  >
                    {de.distribution.serve.correct.removeConfirmButton}
                  </Button>
                </div>
              </details>
            </div>
            {/* The same test id as the hand-out's confirmation above: only one of the two can be on
                screen at a time, and a spec that asserts "the counter confirmed" should not have to
                know which of the two acts it was. */}
            {showingCorrect && correctState.status === "saved" ? (
              <Confirmation
                text={de.distribution.serve.correct.saved}
                testId="serve-confirmation"
              />
            ) : null}
            {correctOverpayment === null ? null : (
              <OverpaymentQuestion
                state={correctOverpayment}
                disabled={correcting}
                testId="correct-confirm-overpayment"
              />
            )}
            {showingCorrect && correctState.status === "error" ? (
              <Notice tone={correctState.tier} text={correctState.message} testId="serve-error" />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  if (canServe) {
    const serveOverpayment = showingServe ? overpaymentIn(serveState) : null;
    // What the field opens on: the amount to pay, or — once the server has asked about it — the
    // amount that was typed, so confirming submits the figure the question named.
    const typedCents = serveOverpayment?.paidCents ?? amountToPayCents;

    return (
      <Card>
        {/* No header: the payment row, the field and one large green button say what this is, and
            the verdict above has already said it may happen. */}
        <CardContent className="flex flex-col gap-4">
          <PaymentRow amountToPayCents={amountToPayCents} balanceCents={balanceCents} />
          <form action={serve} onKeyDown={guardEnter} className="flex flex-col items-start gap-4">
            <input type="hidden" name="customerId" value={customerId} />
            <AmountField key={typedCents} defaultCents={typedCents} testId="serve-amount" />
            <Button
              type="submit"
              size="lg"
              disabled={serving}
              data-testid="serve-button"
              className="h-14 bg-green-700 px-8 text-lg font-semibold text-white hover:bg-green-800"
            >
              {de.distribution.serve.submit}
            </Button>
            {serveOverpayment === null ? null : (
              <OverpaymentQuestion
                state={serveOverpayment}
                disabled={serving}
                testId="serve-confirm-overpayment"
              />
            )}
            {showingServe && serveState.status === "error" ? (
              <Notice tone={serveState.tier} text={serveState.message} testId="serve-error" />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  return null;
}
