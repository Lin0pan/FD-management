/**
 * „Karte ist bereits gedruckt“ on the wire (US-39.5): the field's name, and its reading. Not inside
 * the client component, so the four server actions that issue a card can import it.
 */

import { z } from "zod";

export const CARD_PRINTED_FIELD = "cardPrinted";

/** A native checkbox posts `on` when ticked and nothing at all when not; anything else is tampering. */
export const cardPrinted = z
  .literal("on")
  .optional()
  .transform((value): boolean => value === "on");

/** The field as {@link cardPrinted} expects it — `FormData` answers `null` for an absent field. */
export function cardPrintedValue(formData: FormData): string | undefined {
  const value = formData.get(CARD_PRINTED_FIELD);
  return value === null ? undefined : String(value);
}
