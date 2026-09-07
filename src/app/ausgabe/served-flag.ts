/**
 * The query parameter a recorded hand-out hands its confirmation to the counter through.
 *
 * A module of its own because it is read by a `"use server"` action and by a server component, and a
 * `"use server"` module may export nothing but async functions — the same reason `removed-flag.ts`
 * is one.
 *
 * Unlike the removal's parameter, this one carries the **customer number** rather than a bare `1`,
 * and it travels alone: a recorded hand-out is finished business and the next household is already
 * at the counter, so the screen comes back empty (US-32.7). The number is all the page is given —
 * the name, the amount and the time are read back through `lookupCustomer`, so the confirmation
 * cannot state a figure the record no longer holds.
 */
export const HANDOUT_RECORDED = "erfasst";
