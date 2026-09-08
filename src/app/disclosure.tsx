/**
 * The shape a `<details>`/`<summary>` disclosure takes on every screen.
 *
 * Disclosures are the application's one folding mechanism (`docs/guideline/ui_styling_guide.md` §6),
 * never a `Dialog`: at the counter the queue is waiting and nothing may have to be dismissed before
 * the next customer is served.
 *
 * No `"use client"` and no hooks, so server and client components can both render these.
 */

import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The glyph that says a thing folds, and which way it currently is. Every disclosure suppresses the
 * native marker, a browser triangle being no affordance and drawn differently by the two engines
 * (ADR-012) — so something has to go back in its place, or the fold reads as an inert card.
 *
 * The rotation is the browser's fold state read off the DOM: `group` on the `<details>`, `group-open:`
 * here. **A `<details>` that forgets `group` is a silent no-op**, so the chevron is checked open as
 * well as closed when a screen is reviewed.
 *
 * `aria-hidden`, because a glyph inside a `<summary>` would land in its accessible name (§8) — and an
 * inline SVG rather than a text character, which contributes no `textContent`, so the exact-text
 * assertions reading through a summary stay green.
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
 * `w-fit` because a `<summary>` is a block, and closed, a control must not read as a collapsed section
 * spanning the row. The test id is required rather than optional: every one of these is a control a
 * spec clicks for real (§10).
 *
 * The chevron is what distinguishes these from the buttons they are shaped like — in a danger zone,
 * the difference between „this opens a form“ and „this does the thing“. Its `<details>` needs `group`.
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
