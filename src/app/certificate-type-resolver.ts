/**
 * The Art-des-Nachweises drop-down's sentinel and the one rule that reads it — shared by
 * `certificate-type-field.tsx` (which renders the sentinel as its "Sonstiges" option) and every
 * screen's `"use server"` action (which resolves the submitted pair before it reaches the use case).
 *
 * A module of its own, and deliberately neither `"use client"` nor `"use server"`: a `"use server"`
 * module may export nothing but async functions, so `resolveCertificateType` cannot live beside the
 * actions that call it (`registration-input.ts`'s reason); a `"use client"` module's exports arrive
 * at a `"use server"` action as client-reference proxies, not values (`select.ts`'s reason). Plain,
 * this file is a normal import on both sides of the boundary.
 */

/**
 * The `<select>`'s value for "Sonstiges" — never a certificate type DF could configure, so a
 * submitted value can only mean the free-text field was the one in use. Never rendered; the visible
 * option text is `de.customers.fields.certificateTypeOtherOption`.
 */
export const CERTIFICATE_TYPE_OTHER = "__CERTIFICATE_TYPE_OTHER__";

/**
 * The certificate type a submission names: `other` when `selected` is the sentinel, `selected`
 * otherwise. Does **not** validate — a blank result is the domain's refusal to make
 * (`MissingRequiredField`), and refusing it here would be a second answer to the same question.
 */
export function resolveCertificateType(selected: string, other: string): string {
  return selected === CERTIFICATE_TYPE_OTHER ? other : selected;
}
