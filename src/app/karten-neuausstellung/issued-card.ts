/**
 * The query parameter a completed reissue hands its confirmation to the list through.
 *
 * A module of its own for the reason every `*-state.ts` on these screens is one: it is read by a
 * `"use server"` action and by a server component, and a `"use server"` module may export nothing
 * but async functions.
 *
 * German, like every other parameter staff can see in the address bar (`?nummer=`, `?aufgenommen=`),
 * and it carries a **card number** rather than a name or an id: a card number is printed on a piece
 * of card the household walks around with, so it is the one part of this that was never private.
 */
export const ISSUED_CARD = "ausgestellt";
