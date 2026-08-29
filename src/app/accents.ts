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
import type { BalanceKind, PaymentStanding } from "@/domain/distribution/balance";

/**
 * The group's colour, worn wherever a screen names a household's group.
 *
 * Literal palette values rather than theme tokens: RED and BLUE *are* the printed cards DF hands
 * out, so this is one of the two places in the application where the colour is the datum rather
 * than a decoration of it (`docs/guideline/ui_styling_guide.md` §5) — a theme may not re-map it. The
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
 * A write the staff member asked for has gone through: a hand-out recorded, a reminder logged, a
 * certificate renewed, a household taken on, a note saved.
 *
 * Green, next to `FREE_SLOT_ACCENT`'s emerald, and the two are deliberately not the same green:
 * a free slot is a standing fact about the register that is true until somebody takes it, while this
 * is a receipt for something that just happened. Both are good news, which is why neither is red or
 * amber; the shades differ because only one of them is still there on the next screen.
 *
 * **A save wears it too.** This once drew the boundary at the completion of an *act* and left an
 * edit to an existing record in a neutral box, on the argument that a corrected spelling is not
 * something that happened. The distinction is real and it is not one a volunteer at a counter needs
 * to make: three saves in a row on `/kunden/253` produced three plain white boxes on the same
 * surface as the card behind them, and "did that save?" — the question a confirmation exists to
 * answer — was left open by all three.
 *
 * The word goes with it as always: every user of this accent states what happened in German, and the
 * tint only repeats it.
 */
export const CONFIRMATION_ACCENT = "border-green-600/40 bg-green-600/10";

/**
 * A write did not go through, and nothing is broken: a rule refused it, or the input needs fixing.
 *
 * Amber rather than red because the two say different things to somebody with a queue in front of
 * them — "this household already collected today" is the counter's ordinary business and the staff
 * member can settle it on the spot, while red should mean the screen is describing something that is
 * no longer there. Red for both is what the application said before, and it made every refusal look
 * like a fault.
 *
 * This is the second thing amber says here, and it does not collide with the first. A lapsed
 * certificate is **standing state** — attached to a row or a verdict, true until somebody changes
 * it. A refusal is an **answer to a button**, gone on the next render. They are never the same
 * element and never the same grammar, and the counter's amber `warn` verdict is already the reading
 * "the rules say be careful", so this extends a precedent rather than inventing one.
 *
 * Worn through `Notice`'s `refusal` tone; nothing hand-tints it.
 */
export const REFUSAL_ACCENT = "border-amber-500/40 bg-amber-500/10";

/**
 * How a hand-out's payment stood against what was asked for that day (US-29.8).
 *
 * **Standing state on a row**, like the register's amber for a lapsing certificate — a fact about
 * the hand-out that is as true a year later as it was on the day, not an answer to a button the
 * next render clears. That is why it lives here beside `GROUP_STYLES` rather than in `Notice`'s
 * tones: `REFUSAL_ACCENT`'s amber and this red are never the same element and never the same
 * grammar.
 *
 * Red for a shortfall, green for an exact payment, blue for an overpayment — DF's own wording for
 * the three cases. The shape is the certificate chrome's (`border-…/40 bg-…/10`), because these are
 * the same kind of mark on the same kind of row; the shades are deliberately *not* `GROUP_STYLES`'
 * red-600 and blue-700, which are the printed cards themselves and may not be re-used for anything
 * a household's group does not cause. `EXACT`'s green is `CONFIRMATION_ACCENT`'s literal, and that
 * is the point rather than a duplicate: a payment that matched what was asked is the same good news
 * a completed save is, read on a row instead of in a box.
 *
 * **The colour only reinforces what the cell already says.** Every cell wearing one of these states
 * its own meaning in text — „−2,00 €“, „+2,00 €“, „genau“ — so the history is legible in greyscale,
 * on paper, and to the staff member who cannot tell the three apart (US-03.4). The sign carries it,
 * exactly as it does behind `BALANCE_STYLES`.
 */
export const PAYMENT_STANDING_STYLES: Record<PaymentStanding, string> = {
  SHORT: "border-red-500/40 bg-red-500/10",
  EXACT: "border-green-600/40 bg-green-600/10",
  OVER: "border-blue-500/40 bg-blue-500/10",
};

/**
 * Where a household's balance stands, worn by the Saldo tile at the counter (US-29).
 *
 * **The same red-500 and blue-500 as `PAYMENT_STANDING_STYLES`, deliberately and not by accident.**
 * A hand-out paid short and a household carrying a debt are one meaning at two altitudes — money is
 * owed — and a meaning gets one colour application-wide. Blue likewise reads "paid ahead" in both
 * places. Neither may be `GROUP_STYLES`' red-600/blue-700: those are the printed cards themselves.
 *
 * **A settled balance is `null` and keeps `Stat`'s own `bg-muted/50`.** That is the point of the
 * scale rather than a gap in it: colour here means *something is standing*, so the ordinary case —
 * most households, most weeks — must not be painted, or the two that matter stop standing out.
 *
 * **Background only, no border**, against the `border-…/40 bg-…/10` shape the badges on a row use.
 * Every `Stat` in the application is a borderless filled tile, and outlining one of the five on the
 * counter would make it a different kind of object from the four beside it. `cn`'s `twMerge` drops
 * the muted fill when a tint is passed, so the tile changes colour without changing shape.
 *
 * The word travels with the chrome as always (US-03.4), and here the "word" is the sign: the value
 * reads „−2,00 €“ or „+2,00 €“, which survives greyscale, print and the accessibility snapshot.
 */
export const BALANCE_STYLES: Record<BalanceKind, string | null> = {
  DEBT: "bg-red-500/10",
  CREDIT: "bg-blue-500/10",
  SETTLED: null,
};
