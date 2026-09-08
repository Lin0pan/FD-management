/**
 * The literal tints, and the meanings they are reserved for. Everything else uses theme tokens; these
 * are here because a meaning gets **one** colour application-wide, and two copies of a tint are how
 * two screens come to paint one fact two shades. Look for a state here before adding a treatment.
 *
 * None of them travels alone — the word goes with the chrome, because a colour is a distinction only
 * some of the staff can make (US-03.4).
 */

import type { Group } from "@/domain/customer/group";
import type { BalanceKind, PaymentStanding } from "@/domain/distribution/balance";

/**
 * The group's colour. Literal palette values rather than theme tokens, because RED and BLUE *are* the
 * printed cards DF hands out — one of the two places where the colour is the datum rather than a
 * decoration of it, so a theme may not re-map it (`docs/guideline/ui_styling_guide.md` §5).
 */
export const GROUP_STYLES: Record<Group, string> = {
  RED: "border-red-600/40 bg-red-600/10",
  BLUE: "border-blue-700/40 bg-blue-700/10",
};

/**
 * A customer number is free and somebody is waiting for it (US-18.2). Deliberately neither red nor
 * amber — those are spoken for by a blocked status and a lapsing certificate, and a free slot is not
 * an alarm but ordinary good news.
 */
export const FREE_SLOT_ACCENT = "border-emerald-600/40 bg-emerald-600/15";

/**
 * A write the staff member asked for has gone through — a hand-out recorded, a note saved, an edit
 * stored. **An ordinary save wears it too**: three plain white boxes in a row leave "did that save?"
 * open, which is the question a confirmation exists to answer.
 *
 * Deliberately a different green from `FREE_SLOT_ACCENT`'s emerald: a free slot is a standing fact,
 * this is a receipt for something that just happened, and only one of them is still there on the
 * next screen.
 */
export const CONFIRMATION_ACCENT = "border-green-600/40 bg-green-600/10";

/**
 * A write did not go through, and nothing is broken: a rule refused it, or the input needs fixing.
 *
 * Amber rather than red, because "this household already collected today" is the counter's ordinary
 * business and can be settled on the spot, where red should mean the screen is describing something
 * that is no longer there.
 *
 * The second thing amber says here, and it does not collide with the first: a lapsed certificate is
 * **standing state** on a row, a refusal is an **answer to a button** that the next render clears.
 * Worn through `Notice`'s `refusal` tone; nothing hand-tints it.
 */
export const REFUSAL_ACCENT = "border-amber-500/40 bg-amber-500/10";

/**
 * How a hand-out's payment stood against what was asked that day (US-29.8) — **standing state on a
 * row**, as true a year later as on the day, which is why it lives here rather than among `Notice`'s
 * tones.
 *
 * The shape is the certificate chrome's, these being the same kind of mark on the same kind of row.
 * The shades are deliberately *not* `GROUP_STYLES`' red-600 and blue-700, which are the printed
 * cards and may not be re-used for anything a group does not cause; `EXACT`'s green *is*
 * `CONFIRMATION_ACCENT`'s literal, an exact payment being the same good news a completed save is.
 *
 * **The colour only reinforces what the cell already says** — every cell states its meaning in text,
 * so the history is legible in greyscale and on paper (US-03.4).
 */
export const PAYMENT_STANDING_STYLES: Record<PaymentStanding, string> = {
  SHORT: "border-red-500/40 bg-red-500/10",
  EXACT: "border-green-600/40 bg-green-600/10",
  OVER: "border-blue-500/40 bg-blue-500/10",
};

/**
 * Where a household's balance stands, worn by the Saldo tile at the counter (US-29).
 *
 * **The same red-500 and blue-500 as `PAYMENT_STANDING_STYLES`, deliberately**: a hand-out paid short
 * and a household carrying a debt are one meaning at two altitudes, and a meaning gets one colour
 * application-wide. Neither may be `GROUP_STYLES`' shades, which are the printed cards.
 *
 * **A settled balance is `null`** and keeps `Stat`'s `bg-muted/50` — colour here means *something is
 * standing*, so painting the ordinary case would stop the two that matter standing out.
 *
 * **Background only, no border**: every `Stat` is a borderless filled tile, and outlining one of five
 * would make it a different kind of object from the four beside it. `twMerge` drops the muted fill
 * when a tint is passed, so the tile changes colour without changing shape.
 */
export const BALANCE_STYLES: Record<BalanceKind, string | null> = {
  DEBT: "bg-red-500/10",
  CREDIT: "bg-blue-500/10",
  SETTLED: null,
};
