/**
 * Read the configured Nachweis-Arten (US-33) — the single seam every screen that offers the
 * drop-down reads the list through, rather than reading rows itself.
 */

import {
  createCertificateTypeList,
  type CertificateTypeList,
} from "@/domain/policy/certificateTypes";
import type { CertificateTypeRepository } from "../ports";

export interface ReadCertificateTypesDeps {
  readonly certificateTypes: CertificateTypeRepository;
}

/**
 * The stored labels, put back through {@link createCertificateTypeList} so a hand-edited database
 * cannot put a duplicate into a drop-down.
 */
export async function readCertificateTypes(
  deps: ReadCertificateTypesDeps,
): Promise<CertificateTypeList> {
  const labels = await deps.certificateTypes.list();
  return createCertificateTypeList(labels);
}
