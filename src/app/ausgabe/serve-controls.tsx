"use client";

/**
 * The counter's write controls — recording a hand-out, and correcting the one made today
 * (tasks/prd-us-05-record-attendance.md §US-05.4).
 *
 * A client component only because two things need to happen in the browser: `useActionState` reports
 * a rejection back beside the button, and after a successful hand-out the number field is cleared for
 * the next customer. It holds no rules — whether this customer may be served, and whether a record
 * may still be changed, are decided behind `recordServe` and `correctServe`; this file only lays out
 * the buttons and repeats the server's answer.
 *
 * Which of the two it shows is a property of the day, not a click: a customer with no record today
 * gets the serve action, and one already served gets that record with the controls to amend or remove
 * it. The page decides by passing `todaysRecord`; once a hand-out is recorded the page revalidates and
 * this switches to the correction view on its own.
 */

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { de } from "@/i18n/de";
import { correctServe, recordServe } from "./actions";
import { initialCorrectState, initialServeState } from "./serve-state";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

/** Today's record as the controls need it — serialisable, with the time already in German. */
export interface TodaysRecordProps {
  readonly recordId: number;
  readonly time: string;
  readonly paid: boolean;
}

/**
 * The paid flag. A native checkbox on purpose: the actions read paid as *presence* in the FormData,
 * which is the HTML idiom for a boolean, and Radix's checkbox is a `button[role=checkbox]` that
 * submits nothing of its own. Not worth a hidden input to gain a nicer box.
 */
function PaidCheckbox({
  testId,
  defaultChecked,
}: {
  testId: string;
  defaultChecked: boolean;
}): React.ReactElement {
  return (
    <Label htmlFor={testId} className="w-fit gap-2.5">
      <input
        type="checkbox"
        id={testId}
        name="paid"
        data-testid={testId}
        defaultChecked={defaultChecked}
        className="size-4 rounded-sm border-input accent-primary"
      />
      {de.distribution.serve.paid}
    </Label>
  );
}

export function ServeControls({
  customerId,
  canServe,
  todaysRecord,
  lookedUpNumber,
}: {
  customerId: number;
  canServe: boolean;
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
    const paidLabel = todaysRecord.paid
      ? de.distribution.serve.paidState.paid
      : de.distribution.serve.paidState.unpaid;

    return (
      <Card data-testid="already-served">
        <CardHeader>
          {/* The time and the paid state stay one sentence in one element — it is read as one fact,
              and the e2e asserts both halves against it. */}
          <CardTitle className="text-xl">
            <h2 data-testid="already-served-message">
              {de.distribution.serve.alreadyServed(todaysRecord.time)}{" "}
              <span className="font-medium">({paidLabel})</span>
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {showingServe && serveState.status === "recorded" ? (
            <Confirmation
              text={de.distribution.serve.confirmed(serveState.at)}
              testId="serve-confirmation"
            />
          ) : null}

          <form action={correct} className="flex flex-col gap-3">
            <input type="hidden" name="recordId" value={todaysRecord.recordId} />
            <input type="hidden" name="nummer" value={lookedUpNumber} />
            <h3 className="font-heading text-base font-medium">
              {de.distribution.serve.correct.heading}
            </h3>
            <PaidCheckbox testId="correct-paid" defaultChecked={todaysRecord.paid} />
            <div className="flex flex-wrap items-start gap-3">
              <Button
                type="submit"
                name="action"
                value="SET_PAID"
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
                  <p className="max-w-prose text-sm text-muted-foreground">
                    {de.distribution.serve.correct.removeConfirm}
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
            {showingCorrect && correctState.status === "error" ? (
              <Notice tone="error" text={correctState.message} testId="serve-error" />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  if (canServe) {
    return (
      <Card>
        {/* No header: one large green button and a checkbox say what this is, and the verdict above
            has already said it may happen. */}
        <CardContent>
          <form action={serve} className="flex flex-col items-start gap-4">
            <input type="hidden" name="customerId" value={customerId} />
            <PaidCheckbox testId="serve-paid" defaultChecked />
            <Button
              type="submit"
              size="lg"
              disabled={serving}
              data-testid="serve-button"
              className="h-14 bg-green-700 px-8 text-lg font-semibold text-white hover:bg-green-800"
            >
              {de.distribution.serve.submit}
            </Button>
            {showingServe && serveState.status === "error" ? (
              <Notice tone="error" text={serveState.message} testId="serve-error" />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  return null;
}
