/**
 * The one native `<select>` recipe: `Input`'s tokens, so a select stands level with the fields beside it.
 *
 * **The selects stay native everywhere.** Radix's `Select` is a `<button>` plus a portalled listbox,
 * which neither `selectOption` nor `toHaveValue` reaches and which submits nothing inside a `<form>`.
 * Native is also type-ahead searchable over the registration's 240 options with no JavaScript of ours.
 *
 * No `"use client"`, so a server component may import it: a string exported from a client module
 * arrives as a client-reference proxy (`docs/guideline/ui_styling_guide.md` §9).
 */
export function selectClass(): string {
  return (
    "h-10 w-full rounded-[10px] border border-input bg-card px-3 text-base transition-colors " +
    "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted " +
    "disabled:text-muted-foreground dark:bg-input/30 " +
    // The `aria-invalid:` half of `Input`'s tokens, copied because there is no string to share —
    // `Input` writes its class list inline. Without them a refused `<select>` reddens its label and
    // grows the words underneath while the control itself stays unmarked.
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 " +
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
  );
}
