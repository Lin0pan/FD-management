/**
 * Validate and replace the configured Nachweis-Arten, recording one audit entry naming what changed.
 * The list is a table of its own rather than a settings version (ADR-019), so there is no reason
 * field on the screen to carry through — the changed labels are the whole story.
 */

import {
  createCertificateTypeList,
  diffCertificateTypes,
  type CertificateTypeChange,
  type CertificateTypeList,
} from "@/domain/policy/certificateTypes";
import type { AuditLog, CertificateTypeRepository, Clock } from "../ports";
import { readCertificateTypes } from "./read-certificate-types";

const CERTIFICATE_TYPES_UPDATED = "certificateTypes.updated";

export interface UpdateCertificateTypesDeps {
  readonly certificateTypes: CertificateTypeRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

function describeChanges(changes: ReadonlyArray<CertificateTypeChange>): string {
  return changes
    .map((change) => (change.kind === "added" ? `+${change.label}` : `−${change.label}`))
    .join(", ");
}

/** Whether two validated lists are the same words in the same spelling — both are fold-sorted. */
function sameSpellings(previous: CertificateTypeList, next: CertificateTypeList): boolean {
  return previous.length === next.length && previous.every((label, index) => label === next[index]);
}

/**
 * Validate the submitted labels through the domain, write them, and append one audit entry.
 * Nothing is written unless validation passes, and the same list re-submitted writes neither the
 * list nor an audit entry.
 *
 * Returns what is now **stored**, which is what the screen may show: the re-submitted list is the
 * one already on file, down to the spelling.
 *
 * @throws {MissingRequiredField} if a label is blank after trimming.
 * @throws {CertificateTypeTooLong} if a label exceeds the domain's maximum length.
 * @throws {DuplicateCertificateType} if two labels fold to the same spelling.
 */
export async function updateCertificateTypes(
  deps: UpdateCertificateTypesDeps,
  labels: ReadonlyArray<string>,
): Promise<CertificateTypeList> {
  const next = createCertificateTypeList(labels);
  const previous = await readCertificateTypes(deps);

  if (sameSpellings(previous, next)) {
    return previous;
  }

  await deps.certificateTypes.replace(next);

  // The write and the log part company over a re-spelling. „jobcenter" corrected to „Jobcenter" is
  // stored, because the label is the word the drop-down shows; but it adds and removes no type, so
  // `diffCertificateTypes` has nothing to report and the log — which records *changes* — stays out
  // of it.
  const changes = diffCertificateTypes(previous, next);
  if (changes.length > 0) {
    await deps.audit.append({
      what: CERTIFICATE_TYPES_UPDATED,
      changedFields: ["certificateTypes"],
      when: deps.clock.now(),
      why: describeChanges(changes),
    });
  }
  return next;
}
