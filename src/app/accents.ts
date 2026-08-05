/**
 * The literal tints, and the meanings they are reserved for.
 *
 * Everything else on every screen uses theme tokens. These are here because a meaning gets **one**
 * colour across the whole application: two copies of a tint are how two screens come to paint the
 * same fact two different shades, and the paler one is invariably on the screen where the act is
 * performed. Before adding a treatment for a state, look for the state here first.
 *
 * None of them ever travels alone — the word goes with the chrome, because a colour is a
 * distinction only some of the staff can make (US-03.4).
 */

import type { Group } from "@/domain/customer/group";

/**
 * The group's colour, worn wherever a screen names a household's group.
 *
 * Literal palette values rather than theme tokens: RED and BLUE *are* the printed cards FD hands
 * out, so this is one of the two places in the application where the colour is the datum rather
 * than a decoration of it (`docs/ui_conversion_guide.md` rule 9) — a theme may not re-map it. The
 * word is `de.customers.groups`.
 */
export const GROUP_STYLES: Record<Group, string> = {
  RED: "border-red-600/40 bg-red-600/10",
  BLUE: "border-blue-700/40 bg-blue-700/10",
};

/**
 * A customer number is free and somebody is waiting for it (US-18.2).
 *
 * The same subtle green the register uses for an active household, and deliberately neither red nor
 * amber: those are spoken for by a blocked status and a lapsing certificate, and a free slot is not
 * an alarm — it is the ordinary good news that somebody who has waited can now be served. Worn by
 * the hub's waiting-list badge and by the banner on `/warteliste` and `/kunden/neu`, which is where
 * the registration actually happens.
 */
export const FREE_SLOT_ACCENT = "border-emerald-600/40 bg-emerald-600/15";

/**
 * An act the staff member asked for has completed: a hand-out recorded, a reminder logged, a
 * certificate renewed, a household taken on.
 *
 * Green, next to `FREE_SLOT_ACCENT`'s emerald, and the two are deliberately not the same green:
 * a free slot is a standing fact about the register that is true until somebody takes it, while this
 * is a receipt for something that just happened. Both are good news, which is why neither is red or
 * amber; the shades differ because only one of them is still there on the next screen.
 *
 * It is *not* worn by a save. Editing a note or a spelling on an existing record is feedback that
 * something took, not the completion of an act — those stay the neutral `<Alert role="status">` in
 * `kunden/[id]/record-forms.tsx`, and the boundary is drawn there.
 *
 * The word goes with it as always: every user of this accent states what happened in German, and the
 * tint only repeats it.
 */
export const CONFIRMATION_ACCENT = "border-green-600/40 bg-green-600/10";
