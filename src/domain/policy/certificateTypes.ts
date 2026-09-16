/**
 * The vocabulary of Nachweis-Arten DF maintain themselves (US-33) — the second list-valued thing DF
 * configure, beside the egg rule, and the first that is **not** a policy value: nothing resolves a
 * saved certificate's type back through this list, so it needs no version history to keep an old
 * hand-out priceable the way the egg rule does (ADR-019).
 */

import { CertificateTypeTooLong, DuplicateCertificateType, MissingRequiredField } from "../errors";
import { foldName } from "../customer/nameSearch";

export const CERTIFICATE_TYPE_MAX_LENGTH = 80;

/**
 * A validated list of Nachweis-Arten, always sorted by folded label and never carrying a duplicate.
 * Only {@link createCertificateTypeList} makes one, so a reader may rely on both. An empty list is
 * legitimate — it means only „Sonstiges" is offered, never "not configured".
 */
export type CertificateTypeList = ReadonlyArray<string>;

/**
 * Validate typed labels and return them as a {@link CertificateTypeList}. Sorting is part of
 * constructing the value, not something a caller does first — staff type rows in whatever order they
 * think of, and the drop-down must not reorder between two saves.
 *
 * @throws {MissingRequiredField} naming `certificateTypes.<index>.label`, the index as it was typed,
 *   so the form marks the row on screen.
 * @throws {CertificateTypeTooLong} if a label exceeds {@link CERTIFICATE_TYPE_MAX_LENGTH}.
 * @throws {DuplicateCertificateType} if two labels fold to the same comparable spelling. Carries the
 *   second spelling as typed.
 */
export function createCertificateTypeList(labels: ReadonlyArray<string>): CertificateTypeList {
  const trimmed = labels.map((label, index) => {
    const text = label.trim();
    if (text === "") {
      throw new MissingRequiredField(`certificateTypes.${index}.label`);
    }
    if (text.length > CERTIFICATE_TYPE_MAX_LENGTH) {
      throw new CertificateTypeTooLong(text.length, CERTIFICATE_TYPE_MAX_LENGTH);
    }
    return text;
  });

  // foldName already answers "are these two spellings the same German word", which is exactly the
  // comparison a duplicate vocabulary entry needs — reused rather than a second fold rewriting it.
  const seenFolds = new Set<string>();
  for (const label of trimmed) {
    const folded = foldName(label);
    if (seenFolds.has(folded)) {
      throw new DuplicateCertificateType(label);
    }
    seenFolds.add(folded);
  }

  // No equal case to weigh: two labels folding alike were already refused above as a duplicate.
  return [...trimmed].sort((a, b) => (foldName(a) < foldName(b) ? -1 : 1));
}

/** One label's fate between two versions of the list. */
export type CertificateTypeChange =
  | { readonly kind: "added"; readonly label: string }
  | { readonly kind: "removed"; readonly label: string };

/**
 * What changed between two certificate-type lists, matched **by folded label** rather than by
 * spelling. Re-spelling „jobcenter" as „Jobcenter" is therefore no change; re-spelling it as „JC" is a
 * removal and an addition, which is what it is.
 *
 * Removed labels are reported in `previous`'s order, then added labels in `next`'s order — each in
 * the order of the list it came from, since a fold match carries no shared position the way a
 * threshold does for the egg rule.
 */
export function diffCertificateTypes(
  previous: CertificateTypeList,
  next: CertificateTypeList,
): ReadonlyArray<CertificateTypeChange> {
  const previousFolds = new Set(previous.map(foldName));
  const nextFolds = new Set(next.map(foldName));

  const removed: CertificateTypeChange[] = previous
    .filter((label) => !nextFolds.has(foldName(label)))
    .map((label) => ({ kind: "removed", label }));

  const added: CertificateTypeChange[] = next
    .filter((label) => !previousFolds.has(foldName(label)))
    .map((label) => ({ kind: "added", label }));

  return [...removed, ...added];
}
