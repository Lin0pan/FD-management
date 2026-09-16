/**
 * The state the certificate-type card and its server action pass between them. Outside `actions.ts`
 * because a `"use server"` module may export nothing but async functions.
 *
 * No `values` echo, unlike {@link import("./save-settings-state").SubmittedSettings}: the rows are
 * React state on `CertificateTypeTable` and survive `useActionState`'s reset on their own — the egg
 * rule's own reason (`egg-rule-table.tsx`).
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/** What the card shows after a submission. `idle` is the state before anything was sent. */
export interface SaveCertificateTypesState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  readonly tier?: NoticeTier;
  /** The row a refusal names, where it names one — `MissingRequiredField` does, the other two don't. */
  readonly fields?: ReadonlyArray<FieldRefusal>;
}

export const initialSaveCertificateTypesState: SaveCertificateTypesState = { status: "idle" };
