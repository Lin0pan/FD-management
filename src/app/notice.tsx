/**
 * What the application says back when a staff member presses a button.
 *
 * One component for all three answers, because the alternative is what this replaced: a
 * confirmation written twice in `/ausgabe`, a save's feedback written a third way on the customer
 * record, and a refusal written roughly ten times — which is how red came to have three treatments
 * on one application, only one of which carried an icon. A meaning gets one shape here for the same
 * reason it gets one colour in `accents.ts`.
 *
 * The three tones are the whole vocabulary:
 *
 * - `success` — it happened. A hand-out recorded, a household taken on, a note saved.
 * - `refusal` — it did not happen, and nothing is broken: a rule said no, and the staff member can
 *   act on that at the counter.
 * - `error` — it did not happen and something is wrong. Reloading or a colleague is needed, not
 *   another attempt.
 *
 * The word always carries the meaning and the tint only repeats it, because a colour is a
 * distinction only some of the staff can make (US-03.4). `role="status"` overrides the
 * `role="alert"` the shadcn `Alert` hardcodes: an answer to a button somebody pressed is not an
 * alarm, and a screen reader should reach it rather than be interrupted by it.
 *
 * No `"use client"` and no hooks, so the record's server component and the counter's client
 * components can both render it — the same deliberate choice `stat.tsx` and `shell.ts` make.
 */

import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CONFIRMATION_ACCENT, REFUSAL_ACCENT } from "./accents";

export type NoticeTone = "success" | "refusal" | "error";

/**
 * The chrome of each tone.
 *
 * `error` is the one that reaches for a theme token rather than a literal: `destructive` is the
 * only chromatic token `globals.css` defines, and its `variant` also paints the sentence and the
 * icon, which is why it is the only tone that leaves `AlertDescription` to its own colour.
 *
 * None of them colours its icon. `Alert` sets `*:[svg]:text-current` on every child svg, which
 * outranks a class on the icon itself — `Confirmation` carried a `text-green-700` that had never
 * rendered a single green tick, measured foreground-black on the live page. The icon takes the
 * colour of the box it sits in, and the box is the thing the tint is on.
 */
const TONES: Record<
  NoticeTone,
  { readonly Icon: typeof Check; readonly box: string; readonly destructive?: true }
> = {
  success: { Icon: Check, box: CONFIRMATION_ACCENT },
  refusal: { Icon: TriangleAlert, box: REFUSAL_ACCENT },
  error: { Icon: CircleAlert, box: "border-destructive/40 bg-destructive/5", destructive: true },
};

export function Notice({
  tone,
  text,
  testId,
}: {
  tone: NoticeTone;
  text: string;
  /** Goes on the sentence, so a spec asserts the words rather than the box around them. */
  testId: string;
}): React.ReactElement {
  const { Icon, box, destructive } = TONES[tone];
  return (
    <Alert role="status" variant={destructive ? "destructive" : "default"} className={box}>
      <Icon />
      <AlertDescription
        data-testid={testId}
        // `text-foreground` overrides `AlertDescription`'s muted default — the sentence is the
        // message here, not a note under one. The destructive variant has already coloured it.
        className={destructive ? "max-w-prose" : "max-w-prose text-foreground"}
      >
        {text}
      </AlertDescription>
    </Alert>
  );
}

/**
 * A `Notice` that reports something having happened.
 *
 * Kept as its own name because that is what the five call sites are saying, and reading
 * `tone="success"` at each of them says less than the word does.
 */
export function Confirmation({
  text,
  testId,
}: {
  text: string;
  testId: string;
}): React.ReactElement {
  return <Notice tone="success" text={text} testId={testId} />;
}
