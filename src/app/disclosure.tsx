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

import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The glyph that says a thing folds, and which way it currently is.
 *
 * Every disclosure in the application suppresses the native marker — `list-none` plus the webkit
 * override — because a browser triangle is not a control's affordance and the two engines draw it
 * differently (ADR-012). For a long time nothing went back in its place, and three screens paid for
 * it: „Änderungsverlauf", „Bisherige Ausgaben" and „Im Archiv suchen" each read as a plain, inert
 * card. Two of them bought the affordance back with a *sentence* — „Ausklappen, um alle bisherigen
 * Ausgaben zu sehen" — which is §8's anti-clutter rule paying rent for a missing 16px glyph.
 *
 * The rotation is the browser's fold state read straight off the DOM: `group` on the `<details>`,
 * `group-open:` here. No client component, no state to keep in step — the mechanism
 * `ausgabe/group-progress-card.tsx` already proves. **A `<details>` that forgets `group` is a silent
 * no-op**, so the chevron is checked open as well as closed when a screen is reviewed.
 *
 * `aria-hidden` because it repeats the label rather than adding to it, and because a glyph inside a
 * `<summary>` would otherwise land in its accessible name (§8). It is also why an inline SVG and not
 * a text character: an svg contributes no `textContent`, so the exact-text assertions that read
 * through a summary stay green.
 */
export function FoldChevron(): React.ReactElement {
  return (
    <ChevronDown
      aria-hidden="true"
      data-icon="inline-end"
      className="size-4 shrink-0 transition-transform group-open:rotate-180"
    />
  );
}

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
 *
 * The chevron is what distinguishes these from the buttons they are shaped like: in a danger zone it
 * is the difference between „this opens a form" and „this does the thing". Its `<details>` needs
 * `group`.
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
      <FoldChevron />
    </summary>
  );
}
