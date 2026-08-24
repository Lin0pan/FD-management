/**
 * A figure that drives a decision, set apart from the fields that are only read when something is
 * off. The counter's shape, which is where it was worked out: a small muted label above a large
 * `tabular-nums` value on a `bg-muted/50` tile.
 *
 * Two properties are the point rather than the box:
 *
 * - **The label and the value stay inside one `<p>`.** Split into two stacked `<div>`s they are
 *   announced as two unrelated facts — "Erwachsene", then "4" — with only the layout joining them
 *   (`docs/guideline/ui_styling_guide.md` §9).
 * - **`tabular-nums`, and a caller-supplied width floor where the tiles are compared.** Where two
 *   tiles exist to be diffed, pass `min-w-56` and `whitespace-nowrap` so both keep their value on
 *   one line at the same offset inside the tile; without the pair, the two figures a reader has to
 *   compare drift apart and the tiles stop doing their job. `/karten-neuausstellung` is the worked
 *   example.
 *
 * No `"use client"`: the tile is inert, so it may be rendered by the record's server component and
 * by the registration form's client component alike.
 */
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  testId,
  className,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  /** Goes on the value, never on the tile — the testid must not come to contain its own label. */
  testId: string;
  /** Tile overrides: a width floor where the tiles are compared, a span where they are laid out. */
  className?: string;
  /** Value overrides: a smaller figure where the value is a phrase rather than a single number. */
  valueClassName?: string;
  /** A sub-line under the value, for the one screen that hangs the group off its tiles. */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <p className={cn("flex flex-col gap-1 rounded-lg bg-muted/50 px-4 py-3", className)}>
      <span className="text-xs leading-snug text-muted-foreground">{label}</span>
      <span
        data-testid={testId}
        className={cn("text-3xl font-semibold tabular-nums", valueClassName)}
      >
        {value}
      </span>
      {children}
    </p>
  );
}
