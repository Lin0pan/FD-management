"use client";

/**
 * The counter's write controls — recording a hand-out, and correcting the one made today
 * (tasks/prd-us-05-record-attendance.md §US-05.4).
 *
 * A client component only because two things need to happen in the browser: `useActionState` reports
 * a rejection back beside the button, and after a successful hand-out the number field is cleared and
 * re-focused so the queue keeps moving without the mouse. It holds no rules — whether this customer
 * may be served, and whether a record may still be changed, are decided behind `recordServe` and
 * `correctServe`; this file only lays out the buttons and repeats the server's answer.
 *
 * Which of the two it shows is a property of the day, not a click: a customer with no record today
 * gets the serve action, and one already served gets that record with the controls to amend or remove
 * it. The page decides by passing `todaysRecord`; once a hand-out is recorded the page revalidates and
 * this switches to the correction view on its own.
 */

import { useActionState, useEffect } from "react";
import { de } from "@/i18n/de";
import { correctServe, recordServe } from "./actions";
import { initialCorrectState, initialServeState } from "./serve-state";

/** Today's record as the controls need it — serialisable, with the time already in German. */
export interface TodaysRecordProps {
  readonly recordId: number;
  readonly time: string;
  readonly paid: boolean;
}

function Confirmation({ text }: { text: string }): React.ReactElement {
  return (
    <p
      role="status"
      data-testid="serve-confirmation"
      className="max-w-prose rounded border border-green-600/40 bg-green-600/10 px-3 py-2"
    >
      {text}
    </p>
  );
}

function Rejection({ message }: { message: string }): React.ReactElement {
  return (
    <p
      role="status"
      data-testid="serve-error"
      className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      {message}
    </p>
  );
}

export function ServeControls({
  customerId,
  canServe,
  todaysRecord,
}: {
  customerId: number;
  canServe: boolean;
  todaysRecord: TodaysRecordProps | null;
}): React.ReactElement | null {
  const [serveState, serve, serving] = useActionState(recordServe, initialServeState);
  const [correctState, correct, correcting] = useActionState(correctServe, initialCorrectState);

  // Back to the counter loop: once the hand-out is stored, empty the number field and put the cursor
  // back in it so the next customer's number is typed straight away (US-05.4). The input lives in the
  // page's lookup form; reaching it by id is the one seam between the two.
  useEffect(() => {
    if (serveState.status === "recorded") {
      const input = document.getElementById("counter-input");
      if (input instanceof HTMLInputElement) {
        input.value = "";
        input.focus();
      }
    }
  }, [serveState]);

  if (todaysRecord !== null) {
    const paidLabel = todaysRecord.paid
      ? de.distribution.serve.paidState.paid
      : de.distribution.serve.paidState.unpaid;

    return (
      <section data-testid="already-served" className="flex flex-col gap-4">
        {serveState.status === "recorded" ? (
          <Confirmation text={de.distribution.serve.confirmed(serveState.at)} />
        ) : null}
        <p data-testid="already-served-message" className="text-xl">
          {de.distribution.serve.alreadyServed(todaysRecord.time)}{" "}
          <span className="font-medium">({paidLabel})</span>
        </p>

        <form action={correct} className="flex flex-col gap-3">
          <input type="hidden" name="recordId" value={todaysRecord.recordId} />
          <h3 className="text-lg font-semibold">{de.distribution.serve.correct.heading}</h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="paid"
              data-testid="correct-paid"
              defaultChecked={todaysRecord.paid}
            />
            <span>{de.distribution.serve.paid}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="action"
              value="SET_PAID"
              disabled={correcting}
              data-testid="correct-save"
              className="rounded border border-foreground/20 px-4 py-2 font-medium disabled:opacity-60"
            >
              {de.distribution.serve.correct.save}
            </button>
            {/* The confirmation step before a removal: the summary reveals the warning and the one
                button that actually deletes, so no single click can drop a record. */}
            <details className="rounded border border-red-500/40">
              <summary className="cursor-pointer px-4 py-2 font-medium">
                {de.distribution.serve.correct.remove}
              </summary>
              <div className="flex flex-col gap-2 px-4 pb-3">
                <p className="max-w-prose text-sm">{de.distribution.serve.correct.removeConfirm}</p>
                <button
                  type="submit"
                  name="action"
                  value="REMOVE"
                  disabled={correcting}
                  data-testid="correct-remove"
                  className="self-start rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                  {de.distribution.serve.correct.removeConfirmButton}
                </button>
              </div>
            </details>
          </div>
          {correctState.status === "saved" ? (
            <Confirmation text={de.distribution.serve.correct.saved} />
          ) : null}
          {correctState.status === "error" ? <Rejection message={correctState.message} /> : null}
        </form>
      </section>
    );
  }

  if (canServe) {
    return (
      <form action={serve} className="flex flex-col gap-3">
        <input type="hidden" name="customerId" value={customerId} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="paid" data-testid="serve-paid" defaultChecked />
          <span>{de.distribution.serve.paid}</span>
        </label>
        <div>
          <button
            type="submit"
            disabled={serving}
            data-testid="serve-button"
            className="rounded bg-green-700 px-6 py-3 text-lg font-semibold text-white disabled:opacity-60"
          >
            {de.distribution.serve.submit}
          </button>
        </div>
        {serveState.status === "error" ? <Rejection message={serveState.message} /> : null}
      </form>
    );
  }

  return null;
}
