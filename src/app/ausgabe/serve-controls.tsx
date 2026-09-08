"use client";

/**
 * The counter's write controls — recording a hand-out and correcting the one made today (US-05.4,
 * US-29.7).
 *
 * A client component only for `useActionState`: an unconfirmed overpayment and a refusal come back
 * beside the button that asked. A *success* does not — it navigates, and the confirmation is stated
 * on the screen it lands on (`served-flag.ts`, US-32.7). No rules live here.
 *
 * Which of the two it shows is a property of the day rather than a click: the page decides by passing
 * `todaysRecord`, so a correction is reached by looking the household up again.
 *
 * **The transaction is one number, stated three times over**: what to collect, where the household
 * stands, and what was handed over. The last sits **on the same line as the button that books it**,
 * because the field and the button are one gesture.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { balanceKind } from "@/domain/distribution/balance";
import { formatEuroAmount, formatEuros } from "@/domain/money";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { correctServe, recordServe } from "./actions";
import { BALANCE_STYLES } from "../accents";
import { FoldChevron } from "../disclosure";
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
 * Deliberately not a fifth and sixth derived tile: those four say what the household *draws* this
 * week, these two say what *changes hands* — a different question at a different moment.
 *
 * **One pair: same size, same width, separated by weight.** `Zu zahlen` keeps the semibold, being the
 * figure that leaves the screen — read aloud and counted out in coins — while `Saldo` states where it
 * came from. `Saldo` is **signed**, chosen on the domain's `balanceKind` rather than a comparison
 * written here, and the same call picks the tint: the colour never travels alone (US-03.4).
 *
 * The grid is the counts row's own, verbatim, so `Zu zahlen` sits on `Erwachsene`'s baseline and the
 * two cards read as one column rhythm.
 *
 * **`Saldo` widens to two tracks below `xl`, and that is about one word**: „ausgeglichen“ needs about
 * 195px of tile, which a quarter of the row only reaches at roughly 1200px of viewport.
 */
function PaymentRow({
  amountToPayCents,
  balanceCents,
}: {
  /** `null` for a household already served today: there is no second hand-out to collect for. */
  amountToPayCents: number | null;
  balanceCents: number;
}): React.ReactElement {
  // Read once and used twice, for the wording and the tile: two calls would be two places the sign
  // is read on one screen.
  const kind = balanceKind(balanceCents);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {amountToPayCents === null ? null : (
        <Stat
          label={de.customers.derived.amountToPay}
          value={formatEuros(amountToPayCents)}
          testId="counter-amount-to-pay"
        />
      )}
      <Stat
        label={de.customers.derived.balance}
        value={de.customers.derived.balanceValue(kind, balanceCents)}
        testId="counter-balance"
        className={cn("col-span-2 xl:col-span-1", BALANCE_STYLES[kind])}
        valueClassName="font-medium"
      />
    </div>
  );
}

/**
 * The Betrag field, in the German amount form `formatEuroAmount` writes and `parseEuros` reads back.
 *
 * Pre-filled, because confirming the stated figure is the ordinary case with a queue waiting, and
 * `select`ed on focus so typing a different amount costs no deletion. `inputMode="decimal"` rather
 * than `type="number"`, whose spinner and locale-dependent separator would both be wrong.
 *
 * A native `<label htmlFor>` rather than a placeholder: the accessibility snapshot needs a *named*
 * textbox. `height` is the button's, because the field and the button are one gesture on one line.
 *
 * **Keyed on `defaultCents` by every caller, and that is load-bearing.** React resets an uncontrolled
 * form once its action resolves, so after a refused overpayment the field would snap back to the
 * amount asked for while the question beside it named the amount typed — and confirm would book the
 * wrong number.
 */
function AmountField({
  defaultCents,
  testId,
  height,
}: {
  defaultCents: number;
  testId: string;
  /** The height of the button this field sits beside — `h-14` at the counter, `h-12` correcting. */
  height: string;
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
        className={cn(height, "w-32 text-2xl tabular-nums md:text-2xl")}
      />
    </div>
  );
}

/**
 * The question an amount above the one asked raises, and the button that answers it.
 *
 * **Not a modal, and nothing to dismiss**: with a queue waiting, somebody who typed the wrong amount
 * corrects the field and presses the ordinary button again, and the question stops being asked.
 *
 * The confirm button is a second submit *inside the same form*, re-sending the standing amount with
 * `overpaymentConfirmed` — so the screen never decides a payment is an overpayment, it repeats a
 * question the use case asked (FR-8).
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
  customerNumber,
  canServe,
  amountToPayCents,
  balanceCents,
  todaysRecord,
  lookedUpNumber,
}: {
  customerId: number;
  /**
   * The household's own customer number, submitted so the redirect carrying the confirmation can name
   * them (US-32.7). Deliberately not `lookedUpNumber`: a lookup by `50k3` confirms against slot 50.
   */
  customerNumber: number;
  canServe: boolean;
  /** What to collect today, shown and pre-filled only while there is a hand-out still to record. */
  amountToPayCents: number;
  /** The household's balance as it stands now — today's payment included once one is recorded. */
  balanceCents: number;
  todaysRecord: TodaysRecordProps | null;
  /**
   * What was typed to reach this household, submitted with a removal so the redirect comes back to
   * the same lookup rather than an empty field.
   */
  lookedUpNumber: string;
}): React.ReactElement | null {
  const [serveState, serve, serving] = useActionState(recordServe, initialServeState);
  const [correctState, correct, correcting] = useActionState(correctServe, initialCorrectState);
  // Two slots, not one: a hand-out and a correction can both be sitting in this component's state at
  // once. They share a test id because the board makes only one of them current.
  const showingServe = useNoticeSlot("serve", serveState.status === "idle" ? null : serveState);
  const showingCorrect = useNoticeSlot(
    "correct",
    correctState.status === "idle" ? null : correctState,
  );

  if (todaysRecord !== null) {
    // Off the action state, never `showingCorrect`: the board decides which *notice* is on screen,
    // and another control claiming it must not rewrite the amount somebody typed.
    const correctOverpayment = overpaymentIn(correctState);
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
            {/* Field and save button on one line, as on the serve form — the same gesture, so the
                same shape. The removal stays *out* of this row on purpose: an open `<details>` is
                the tallest thing on its flex line, and under `items-end` opening it would push the
                field and the save button down as it grew. It is also a different act, confirmed on
                its own. */}
            <div className="flex flex-wrap items-end gap-3">
              <AmountField
                key={typedCents}
                defaultCents={typedCents}
                testId="correct-amount"
                height="h-12"
              />
              <Button
                type="submit"
                name="action"
                value="SET_PAYMENT"
                variant="outline"
                disabled={correcting}
                data-testid="correct-save"
                className="h-12"
              >
                {de.distribution.serve.correct.save}
              </Button>
            </div>
            {/* The confirmation step before a removal: the summary reveals the warning and the one
                button that actually deletes, so no single click can drop a record. A native
                `<details>` rather than a dialog — at the counter the queue is waiting, and nothing
                here may have to be dismissed before the next customer can be served.

                `self-start` because the form is a column and would otherwise stretch this to the
                card's full width, turning a small disclosure into a bar the width of the screen. */}
            <details className="group self-start rounded-lg border border-destructive/40">
              {/* The one summary in the application with no test id: `serve.spec.ts` and
                  `balance.spec.ts` reach it by its exact text, so the chevron has to be an inline
                  SVG rather than a glyph — an svg contributes no text content. It also replaces the
                  native marker this fold kept, which the two engines draw differently (ADR-012). */}
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive [&::-webkit-details-marker]:hidden">
                {de.distribution.serve.correct.remove}
                <FoldChevron />
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
            {/* The correction's confirmation stays where it is made, and it is the only one this
                component still shows: a staff member correcting a record is working on it and may
                want to go on looking at it, while a *hand-out* is finished business and clears the
                screen (US-32.7). The test id predates that split and is kept — the specs asserting
                it are all about a correction. */}
            {showingCorrect && correctState.status === "saved" ? (
              <Confirmation
                text={de.distribution.serve.correct.saved}
                testId="serve-confirmation"
              />
            ) : null}
            {showingCorrect && correctOverpayment !== null ? (
              <OverpaymentQuestion
                state={correctOverpayment}
                disabled={correcting}
                testId="correct-confirm-overpayment"
              />
            ) : null}
            {showingCorrect && correctState.status === "error" ? (
              <Notice tone={correctState.tier} text={correctState.message} testId="serve-error" />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  if (canServe) {
    // The amount to pay, or — once the server has asked — the amount typed, so confirming submits
    // the figure the question named. Off the action state, for the correction form's reason.
    const serveOverpayment = overpaymentIn(serveState);
    const typedCents = serveOverpayment?.paidCents ?? amountToPayCents;

    return (
      <Card>
        {/* No header: the payment row, the field and one large green button say what this is, and
            the verdict above has already said it may happen. */}
        <CardContent className="flex flex-col gap-4">
          <PaymentRow amountToPayCents={amountToPayCents} balanceCents={balanceCents} />
          <form action={serve} onKeyDown={guardEnter} className="flex flex-col items-start gap-4">
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="kundennummer" value={customerNumber} />
            {/* The amount and the button that books it, on one line: `items-end` sits the `h-14`
                button on the `h-12` field's own bottom edge, with the field's label riding above
                both. The row is a `div` inside the column and not the form itself, because what
                follows it — the overpayment question, a refusal — are answers *about* this row and
                belong under it at full width, not beside it. `flex-wrap` lets the pair break apart
                on a narrow viewport rather than squeeze the button. */}
            <div className="flex flex-wrap items-end gap-4">
              <AmountField
                key={typedCents}
                defaultCents={typedCents}
                testId="serve-amount"
                height="h-14"
              />
              <Button
                type="submit"
                size="lg"
                disabled={serving}
                data-testid="serve-button"
                className="h-14 bg-green-700 px-8 text-lg font-semibold text-white hover:bg-green-800"
              >
                {de.distribution.serve.submit}
              </Button>
            </div>
            {showingServe && serveOverpayment !== null ? (
              <OverpaymentQuestion
                state={serveOverpayment}
                disabled={serving}
                testId="serve-confirm-overpayment"
              />
            ) : null}
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
