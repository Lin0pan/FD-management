/**
 * The one native `<select>` recipe: `Input`'s tokens, with the control height as the only knob.
 *
 * **The selects stay native everywhere.** Radix's `Select` is a `<button>` plus a portalled listbox,
 * which neither `selectOption` nor `toHaveValue` reaches and which submits nothing inside a `<form>`.
 * Native is also type-ahead searchable over the registration's 240 options with no JavaScript of ours.
 *
 * The height is the argument because a select must match the `Input`s beside it and the screens
 * disagree (`h-9` on `/einstellungen`, `h-8` on `/kunden/neu`). The `disabled:` tokens are inert on an
 * enabled control, so they are not a second knob.
 *
 * No `"use client"`, so a server component may import it: a string exported from a client module
 * arrives as a client-reference proxy (`docs/guideline/ui_styling_guide.md` §9).
 */
export function selectClass(height: "h-8" | "h-9"): string {
  return (
    `${height} w-full rounded-lg border border-input bg-transparent px-2.5 text-sm ` +
    "transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 " +
    "focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 " +
    "disabled:opacity-50 dark:bg-input/30 " +
    // The `aria-invalid:` half of `Input`'s tokens, copied because there is no string to share —
    // `Input` writes its class list inline. Without them a refused `<select>` reddens its label and
    // grows the words underneath while the control itself stays unmarked.
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 " +
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
  );
}
