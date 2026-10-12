"use client";

/**
 * The counter's write — recording a hand-out or correcting the one made today (US-05.4, US-29.7) —
 * spread across the mask (US-41.4): the button stands beside the lookup, „Gezahlt“ among the tiles,
 * the answer in the status slot. One `<form id>`, which the button and the field join through the
 * HTML `form` attribute, because the lookup's GET form lies between them and forms cannot nest.
 *
 * A client component only for `useActionState`, shared by context because its three pieces stand in
 * three rows. A *success* navigates and is stated on the screen it lands on (`served-flag.ts`,
 * US-32.7). No rules live here: which mode applies is the page's, off the lookup.
 */

import { Check } from "lucide-react";
import { createContext, useActionState, useContext, useId } from "react";
import { Button } from "@/components/ui/button";
import { formatEuroAmount } from "@/domain/money";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { correctServe, recordServe } from "./actions";
import { FoldChevron } from "../disclosure";
import { initialCorrectState, initialServeState } from "./serve-state";
import type { CorrectState, ServeState } from "./serve-state";
import { guardEnter } from "../enter-guard";
import { useLookupEdited } from "./lookup-field";
import { FieldRejection } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";
import { SLOT_NOTICE } from "./slot-notice";

/** The `id` the button, „Gezahlt“ and the overpayment confirmation join the form by. */
const FORM_ID = "counter-serve-form";

/** The session's record as the controls need it — serialisable, with the time already in German. */
export interface SessionRecordProps {
  readonly recordId: number;
  readonly time: string;
  /** What the household handed over. The correction field opens on it, unchanged. */
  readonly paidCents: number;
  /** What the counter asked at the session this record was made in — what it is judged against. */
  readonly askedCents: number;
  /** Where the balance would stand if this record were removed, so the warning says so. */
  readonly balanceWithoutRecordCents: number;
}

/**
 * What the mask offers for the household on screen — the state table of the PRD, one row each:
 * nothing looked up, a hand-out to record, today's record to correct, or a verdict that refuses.
 */
export type ServeMode =
  | { readonly kind: "none" }
  | {
      readonly kind: "serve";
      readonly customerId: number;
      /**
       * The household's own number, submitted so the redirect carrying the confirmation can name
       * them (US-32.7). Not the query: a lookup by `50k3` confirms against slot 50.
       */
      readonly customerNumber: number;
      readonly amountToPayCents: number;
    }
  | {
      readonly kind: "correct";
      readonly record: SessionRecordProps;
      /** Submitted with a removal, so the redirect comes back to the same lookup. */
      readonly lookedUpNumber: string;
    }
  | { readonly kind: "refused" };

interface ServeContext {
  readonly mode: ServeMode;
  readonly serveState: ServeState;
  readonly correctState: CorrectState;
  readonly pending: boolean;
  /** Whether this form's answer is the one the board is showing (`notice-board.tsx`). */
  readonly showing: boolean;
}

const Context = createContext<ServeContext | null>(null);

function useServe(): ServeContext {
  const context = useContext(Context);
  if (context === null) {
    throw new TypeError("a counter serve control rendered outside ServeFormProvider");
  }
  return context;
}

/**
 * Holds the two action states and renders the form the pieces below join. **Keyed by the page on
 * the household and the mode**: a redirect out of an action leaves its state as it was, so without
 * the remount a „Eintrag aktualisiert.“ would outlive the record it was about.
 */
export function ServeFormProvider({
  mode,
  children,
}: {
  mode: ServeMode;
  children: React.ReactNode;
}): React.ReactElement {
  const [serveState, serve, serving] = useActionState(recordServe, initialServeState);
  const [correctState, correct, correcting] = useActionState(correctServe, initialCorrectState);
  const showingServe = useNoticeSlot("serve", serveState.status === "idle" ? null : serveState);
  const showingCorrect = useNoticeSlot(
    "correct",
    correctState.status === "idle" ? null : correctState,
  );

  const context: ServeContext =
    mode.kind === "correct"
      ? { mode, serveState, correctState, pending: correcting, showing: showingCorrect }
      : { mode, serveState, correctState, pending: serving, showing: showingServe };

  return (
    <Context.Provider value={context}>
      {children}
      {mode.kind === "serve" ? (
        <form id={FORM_ID} action={serve}>
          <input type="hidden" name="customerId" value={mode.customerId} />
          <input type="hidden" name="kundennummer" value={mode.customerNumber} />
        </form>
      ) : null}
      {mode.kind === "correct" ? (
        <form id={FORM_ID} action={correct}>
          <input type="hidden" name="recordId" value={mode.record.recordId} />
          <input type="hidden" name="nummer" value={mode.lookedUpNumber} />
        </form>
      ) : null}
    </Context.Provider>
  );
}

/** The amount the last submission was refused over, or `null`. */
function overpaymentIn(
  state: ServeState | CorrectState,
): { readonly paidCents: number; readonly amountToPayCents: number } | null {
  return state.status === "confirmOverpayment" ? state : null;
}

/** The state of whichever form the mode shows. */
function stateOf(context: ServeContext): ServeState | CorrectState {
  return context.mode.kind === "correct" ? context.correctState : context.serveState;
}

/**
 * The button beside the lookup. Green while a hand-out may be recorded, outline „Betrag speichern“
 * while correcting, and otherwise the same button greyed out — it stays in its place so the row
 * does not shift between households — greyed too while the number field names someone else
 * (`lookup-field.tsx`). The use case re-checks before writing (FR-8).
 */
export function ActionButton(): React.ReactElement {
  const { mode, pending } = useServe();
  const edited = useLookupEdited();

  if (mode.kind === "correct") {
    return (
      <Button
        type="submit"
        form={FORM_ID}
        name="action"
        value="SET_PAYMENT"
        variant="outline"
        disabled={pending || edited}
        data-testid="correct-save"
        className="h-12 px-[22px] text-lg font-semibold"
      >
        {de.distribution.serve.correct.save}
      </Button>
    );
  }

  const enabled = mode.kind === "serve" && !edited;
  return (
    <Button
      type="submit"
      form={FORM_ID}
      disabled={!enabled || pending}
      data-testid="serve-button"
      className={cn(
        "h-12 px-[22px] text-lg font-semibold",
        enabled
          ? "bg-green-700 text-white hover:bg-green-800"
          : "bg-muted text-muted-foreground disabled:opacity-100",
      )}
    >
      <Check aria-hidden="true" data-icon="inline-start" className="size-5" />
      {de.distribution.serve.submit}
    </Button>
  );
}

/**
 * „Gezahlt (von 4,00 €)“, the amount handed over, among the tiles (US-41.5).
 *
 * Pre-filled, because confirming the stated figure is the ordinary case with a queue waiting, and
 * selected on focus so typing a different amount costs no deletion. `guardEnter` on the field
 * itself: it joins its form by attribute, so the form never sees its keydown.
 *
 * **Keyed on the cents it opens with, and that is load-bearing.** React resets a form once its
 * action resolves, so after a refused overpayment the field would snap back to the amount asked for
 * while the question named the amount typed — and confirming would book the wrong number.
 */
export function PaidTile(): React.ReactElement | null {
  const context = useServe();
  const { mode } = context;
  const id = useId();
  if (mode.kind === "none") {
    return null;
  }

  const state = stateOf(context);
  const overpayment = overpaymentIn(state);
  const problem = state.status === "error" ? problemAt(state.fields, "betrag") : null;
  const refused = mode.kind === "refused";
  const words = de.distribution.serve;

  const opening =
    mode.kind === "serve"
      ? { cents: mode.amountToPayCents, askedCents: mode.amountToPayCents }
      : mode.kind === "correct"
        ? { cents: mode.record.paidCents, askedCents: mode.record.askedCents }
        : null;
  const defaultCents = overpayment?.paidCents ?? opening?.cents ?? null;
  const fieldId = `${id}-paid`;
  const askedId = `${id}-asked`;
  const field = marking("betrag", fieldId, problem);

  return (
    // The message under a refused amount runs on under „Saldo“ rather than widening the tile, which
    // would wrap the row.
    <div className="flex w-40 flex-col gap-1">
      <div
        className={cn(
          "flex w-40 flex-col gap-0.5 rounded-lg bg-background px-3 py-1.5 ring-1 ring-input focus-within:ring-2 focus-within:ring-ring",
          problem !== null && "ring-2 ring-destructive focus-within:ring-destructive",
          refused && "opacity-50",
        )}
      >
        <span className="flex items-baseline gap-1 text-xs leading-snug">
          <label
            htmlFor={fieldId}
            className={problem === null ? "text-muted-foreground" : "font-medium text-destructive"}
          >
            {words.amount}
          </label>
          {opening === null ? null : (
            <span
              id={askedId}
              data-testid={mode.kind === "correct" ? "correct-asked" : "counter-amount-to-pay"}
              className="text-muted-foreground tabular-nums"
            >
              {words.asked(opening.askedCents)}
            </span>
          )}
        </span>
        <span className="flex h-8 items-center gap-1">
          <input
            key={defaultCents ?? "refused"}
            type="text"
            name="betrag"
            form={FORM_ID}
            id={fieldId}
            inputMode="decimal"
            autoComplete="off"
            disabled={refused}
            defaultValue={defaultCents === null ? "" : formatEuroAmount(defaultCents)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={guardEnter}
            data-testid={mode.kind === "correct" ? "correct-amount" : "serve-amount"}
            {...field}
            aria-describedby={
              [opening === null ? null : askedId, field["aria-describedby"]]
                .filter((part) => part !== null && part !== undefined)
                .join(" ") || undefined
            }
            className="w-full min-w-0 bg-transparent text-right text-[22px] font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
          />
          <span aria-hidden="true" className="text-lg font-semibold">
            €
          </span>
        </span>
      </div>
      {problem === null ? null : (
        <span className="w-max max-w-xs">
          <FieldRejection id={fieldId} problem={problem} testId="serve-amount-error" />
        </span>
      )}
    </div>
  );
}

/**
 * The status slot beside the button (US-41.4, decision 6): the answer to the last write, or else
 * what the screen came back with, or else the verdict's chip. One answer at a time — a refused
 * amount is the exception and marks its tile instead.
 */
export function StatusSlot({
  verdictKind,
  chip,
  answer,
}: {
  /** `null` with nobody looked up, so `counter-verdict` exists exactly while a verdict does. */
  verdictKind: string | null;
  chip: React.ReactNode;
  /** A confirmation the screen was navigated to with, or an unreadable number. */
  answer: React.ReactNode;
}): React.ReactElement {
  const context = useServe();
  const own = context.showing ? <OwnAnswer context={context} /> : null;
  return (
    <div
      data-testid={verdictKind === null ? undefined : "counter-verdict"}
      data-verdict={verdictKind ?? undefined}
      className="flex min-h-12 min-w-64 flex-1 items-center"
    >
      {own ?? answer ?? chip}
    </div>
  );
}

/** This form's own answer, or `null` where it has none for the slot. */
function OwnAnswer({ context }: { context: ServeContext }): React.ReactElement | null {
  const state = stateOf(context);
  const correcting = context.mode.kind === "correct";

  if (state.status === "saved") {
    return (
      <Confirmation
        text={de.distribution.serve.correct.saved}
        testId="serve-confirmation"
        className={SLOT_NOTICE}
      />
    );
  }
  if (state.status === "confirmOverpayment") {
    // A second submit re-sending the standing amount with `overpaymentConfirmed`, so the screen
    // never decides a payment is an overpayment — it repeats a question the use case asked (FR-8).
    // Not a modal: somebody who mistyped corrects the field and presses the ordinary button again.
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Notice
          tone="refusal"
          text={de.distribution.serve.overpayment.question(state.paidCents, state.amountToPayCents)}
          testId="serve-error"
          className={cn(SLOT_NOTICE, "min-w-0 flex-1")}
        />
        <Button
          type="submit"
          form={FORM_ID}
          name="overpaymentConfirmed"
          value="1"
          variant="outline"
          disabled={context.pending}
          data-testid={correcting ? "correct-confirm-overpayment" : "serve-confirm-overpayment"}
          className="h-12 shrink-0 text-base"
        >
          {de.distribution.serve.overpayment.confirm}
        </Button>
      </div>
    );
  }
  if (state.status === "error" && state.fields === undefined) {
    return (
      <Notice tone={state.tier} text={state.message} testId="serve-error" className={SLOT_NOTICE} />
    );
  }
  return null;
}

/**
 * The removal of today's record: the summary reveals the warning and the one button that deletes,
 * so no single click can drop a record. A `<details>` rather than a dialog — nothing at the counter
 * may have to be dismissed before the next customer is served. Moves into the mask's footer with
 * US-41.7.
 */
export function RemoveEntry(): React.ReactElement | null {
  const { mode, pending } = useServe();
  if (mode.kind !== "correct") {
    return null;
  }
  return (
    <details className="group self-start rounded-lg border border-destructive/40">
      {/* No test id: `serve.spec.ts` and `balance.spec.ts` reach it by its exact text, so the
          chevron is an inline SVG, which contributes no text content. */}
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive [&::-webkit-details-marker]:hidden">
        {de.distribution.serve.correct.remove}
        <FoldChevron />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p
          data-testid="correct-remove-warning"
          className="max-w-prose text-sm text-muted-foreground"
        >
          {de.distribution.serve.correct.removeConfirm(mode.record.balanceWithoutRecordCents)}
        </p>
        <Button
          type="submit"
          form={FORM_ID}
          name="action"
          value="REMOVE"
          variant="destructive"
          disabled={pending}
          data-testid="correct-remove"
          className="h-9 self-start"
        >
          {de.distribution.serve.correct.removeConfirmButton}
        </Button>
      </div>
    </details>
  );
}
