/**
 * The shape a `<details>`/`<summary>` disclosure takes on every screen.
 *
 * Disclosures are the application's one folding mechanism (`docs/guideline/ui_styling_guide.md` §6):
 * never a `Dialog`, because at the counter the queue is waiting and nothing may have to be dismissed
 * before the next customer is served. What was missing was a single statement of what one *looks*
 * like. The button-shaped recipe was written seven times across six files — twice as a local
 * `SUMMARY` const and five times inline — which is the third-hand-rolled-copy rule (§4) and the same
 * argument `notice.tsx` makes about a meaning getting one shape.
 *
 * No `"use client"` and no hooks, so the record's server components and the counter's client
 * components can both render these — the deliberate choice `notice.tsx` and `stat.tsx` make.
 */

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A `<summary>` that reads as the outline button it is: "this opens a write".
 *
 * `w-fit` because a `<summary>` is a block, and closed, a control must not read as a collapsed
 * section spanning the row — the recipe `/karten-neuausstellung` set. `list-none` and the webkit
 * override remove the triangle the variant does not draw around.
 *
 * The test id is required rather than optional: every one of these is a control a spec clicks for
 * real (§10 — never `evaluate(d => d.open = true)`), so a disclosure with no way to address it is a
 * mistake rather than a case to support.
 */
export function ControlSummary({
  testId,
  children,
}: {
  testId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <summary
      data-testid={testId}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
      )}
    >
      {children}
    </summary>
  );
}
