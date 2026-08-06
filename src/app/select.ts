/**
 * The one native `<select>` recipe: `Input`'s own tokens, with the control height as the only knob.
 *
 * The selects stay native everywhere. Radix's `Select` is a `<button>` plus a portalled listbox, so
 * neither `selectOption` nor `toHaveValue` reaches it, and a `<select>` inside a `<form>` submits a
 * value of its own where a Radix one submits nothing. Native is also type-ahead searchable over the
 * registration form's 240 options — typing `1` then `5` lands on 15 — with no JavaScript of ours.
 *
 * It was three copies of one string before this module: `/einstellungen`, the `/kunden` filters and
 * `/kunden/neu`, the last of them differing in exactly two ways. The height is a real per-screen
 * decision, because a select must match the height of the `Input`s beside it and the two screens
 * disagree about that (`/einstellungen` puts every control on `h-9`, `/kunden/neu` leaves `Input` at
 * its `h-8` default) — so it is the argument. The `disabled:` tokens are not a decision at all: they
 * are inert on an enabled control, and the alternative is a second knob that the one screen with a
 * disabled select would have to remember to pass.
 *
 * A plain module with no `"use client"` directive, so a server component may import it: a string
 * exported from a client module arrives across the boundary as a client-reference proxy rather than
 * as a string (`docs/ui_conversion_guide.md`, the `/warteliste` findings). A function rather than a
 * record of two strings for the same reason a `cva` variant is not a lookup table — the caller says
 * what it wants, and there is nothing to keep in sync.
 */
export function selectClass(height: "h-8" | "h-9"): string {
  return (
    `${height} w-full rounded-lg border border-input bg-transparent px-2.5 text-sm ` +
    "transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 " +
    "focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 " +
    "disabled:opacity-50 dark:bg-input/30"
  );
}
