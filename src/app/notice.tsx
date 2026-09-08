/**
 * What the application says back when a staff member presses a button. One component for all three
 * answers, so a meaning gets one shape here for the reason it gets one colour in `accents.ts`.
 *
 * - `success` — it happened.
 * - `refusal` — it did not, and nothing is broken: a rule said no, and staff can act on that.
 * - `error` — it did not, and something is wrong. A reload or a colleague, not another attempt.
 *
 * The word always carries the meaning and the tint only repeats it (US-03.4). `role="status"`
 * overrides the `role="alert"` shadcn's `Alert` hardcodes: an answer to a button is not an alarm,
 * and a screen reader should reach it rather than be interrupted by it.
 *
 * No `"use client"` and no hooks, so server and client components can both render it.
 */

import { Fragment } from "react";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Segment } from "@/i18n/de";
import { CONFIRMATION_ACCENT, REFUSAL_ACCENT } from "./accents";
import type { NoticeTier } from "./notice-tier";

/**
 * The three answers: a success plus the two a failure can be. `NoticeTier` lives in `notice-tier.ts`
 * because a `"use server"` action names it and must not import a component to do so; composing rather
 * than re-listing is what keeps a tier the actions produce a tone this can render.
 */
export type NoticeTone = "success" | NoticeTier;

/**
 * The chrome of each tone. `error` is the one reaching for a theme token — `destructive` is the only
 * chromatic token `globals.css` defines, and its `variant` paints the sentence too, which is why it
 * is the only tone leaving `AlertDescription` its own colour.
 *
 * **None of them colours its icon**: `Alert` sets `*:[svg]:text-current` on every child svg, which
 * outranks a class on the icon itself. The icon takes the colour of the box it sits in.
 */
const TONES: Record<
  NoticeTone,
  { readonly Icon: typeof Check; readonly box: string; readonly destructive?: true }
> = {
  success: { Icon: Check, box: CONFIRMATION_ACCENT },
  refusal: { Icon: TriangleAlert, box: REFUSAL_ACCENT },
  error: { Icon: CircleAlert, box: "border-destructive/40 bg-destructive/5", destructive: true },
};

/**
 * A dictionary sentence with its emphasised fragments in bold — rendered here so emphasis has one
 * appearance application-wide. A plain string stays a string, which is what let the two segmented
 * sentences exist without touching the twenty call sites that are not.
 */
export function Sentence({ text }: { text: string | ReadonlyArray<Segment> }): React.ReactElement {
  if (typeof text === "string") {
    return <>{text}</>;
  }
  // Keyed by position, which is safe here: the sentence is fixed in the dictionary, a fragment has
  // no identity apart from where it sits, and the list is never reordered or filtered.
  return (
    <>
      {text.map((segment, index) => (
        <Fragment key={index}>
          {segment.strong ? (
            <strong className="font-semibold">{segment.text}</strong>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </>
  );
}

export function Notice({
  tone,
  text,
  testId,
  children,
}: {
  tone: NoticeTone;
  /** A whole sentence, or one written as parts so that a figure in it can be emphasised. */
  text: string | ReadonlyArray<Segment>;
  /** Goes on the sentence, so a spec asserts the words rather than the box around them. */
  testId: string;
  /**
   * One way onward, inside the box that states the fact (US-32.7). It sits *within* the sentence's
   * element, so a screen reader reaching the status reaches the offer with it.
   */
  children?: React.ReactNode;
}): React.ReactElement {
  const { Icon, box, destructive } = TONES[tone];
  return (
    <Alert role="status" variant={destructive ? "destructive" : "default"} className={box}>
      <Icon />
      <AlertDescription
        data-testid={testId}
        // The tier rides on an attribute rather than a second test id: four specs assert
        // `getByTestId("…-error").toHaveCount(0)` to mean *nothing was refused*, and moving amber to
        // its own id would leave all four asserting the absence of something that no longer renders.
        data-tier={tone}
        // Overrides `AlertDescription`'s muted default — the sentence is the message here, not a
        // note under one. The destructive variant has already coloured it.
        className={destructive ? "max-w-prose" : "max-w-prose text-foreground"}
      >
        <Sentence text={text} />
        {children}
      </AlertDescription>
    </Alert>
  );
}

/** A `Notice` that reports something having happened — its own name, because that is what the five
 * call sites are saying. */
export function Confirmation({
  text,
  testId,
  children,
}: {
  text: string | ReadonlyArray<Segment>;
  testId: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Notice tone="success" text={text} testId={testId}>
      {children}
    </Notice>
  );
}
