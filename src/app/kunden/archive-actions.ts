"use server";

/**
 * The archive action — the thin adapter between the archive form and the `archiveCustomer` use case
 * (tasks/prd-us-10-archive-customer.md §US-10.4).
 *
 * It sits one level above `[id]/actions.ts` because archiving is offered on two screens: the customer
 * record and the counter, where staff meet the household who has stopped coming (FR-2). Both use this
 * one action, so there is a single path by which a customer is archived and a single place that turns
 * its refusals into German.
 *
 * Every rule lives behind the use case: that the reason is mandatory and that an already-archived
 * household cannot be archived again are the state machine's to decide. The disabled save button is a
 * courtesy to whoever clicked; this file only reports the answer back.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { archiveCustomer } from "@/application/customers/archive-customer";
import { IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { initialArchiveState, type ArchiveState } from "./archive-state";
import { customerDeps } from "./deps";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Archive the customer named by the hidden `customerId`, storing the reason from the textarea.
 *
 * On success both screens are revalidated: the record, which then renders read-only behind its
 * archived banner, and the counter, whose lookup must answer `ARCHIVED` for the number from now on —
 * whichever of the two the archive was started from.
 */
export async function archiveCustomerAction(
  _previous: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.archive.errors.unknown };
  }

  try {
    await archiveCustomer(customerDeps, {
      customerId: customerId.data,
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error: unknown) {
    if (error instanceof MissingAuditReason) {
      return { status: "error", message: de.customers.archive.errors.missingReason };
    }
    if (error instanceof IllegalStatusTransition) {
      return { status: "error", message: de.customers.archive.errors.notArchivable };
    }
    return { status: "error", message: de.customers.archive.errors.unknown };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  return initialArchiveState;
}
