"use server";

/**
 * The block and unblock actions — the thin adapters between the block forms and the `blockCustomer` /
 * `unblockCustomer` use cases (tasks/prd-us-08-block-unblock-customer.md §US-08.4).
 *
 * They sit one level above `[id]/actions.ts` for the reason `archive-actions.ts` does: blocking is
 * offered on two screens now — the customer record and the counter, where the reason to pause a
 * household usually comes up (tasks/prd-us-16-maintain-customer-record.md §US-16.5). Both screens use
 * this one pair of actions, so there is a single path by which a customer is blocked and a single
 * place that turns its refusals into German.
 *
 * Every rule lives behind the use cases: that a block needs a non-empty reason, and that only an
 * active customer can be blocked or a blocked one lifted, are the state machine's to decide. The
 * disabled save button is a courtesy, not the guard. On success both screens are revalidated, so the
 * status, the reason and the controls come back from the store rather than from client memory —
 * whichever of the two the block was started from.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { blockCustomer } from "@/application/customers/block-customer";
import { unblockCustomer } from "@/application/customers/unblock-customer";
import { IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { initialBlockState, type BlockState } from "./block-state";
import { customerDeps } from "./deps";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Block the customer named by the hidden `customerId`, storing the reason from the textarea.
 *
 * An empty reason is refused by `blockCustomer` even though the button is disabled until one is
 * typed, and blocking a non-active customer is an illegal transition — both come back as a German
 * sentence beside the form.
 */
export async function blockCustomerAction(
  _previous: BlockState,
  formData: FormData,
): Promise<BlockState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.block.errors.unknown };
  }

  try {
    await blockCustomer(customerDeps, {
      customerId: customerId.data,
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error: unknown) {
    if (error instanceof MissingAuditReason) {
      return { status: "error", message: de.customers.block.errors.missingReason };
    }
    if (error instanceof IllegalStatusTransition) {
      return { status: "error", message: de.customers.block.errors.notBlockable };
    }
    return { status: "error", message: de.customers.block.errors.unknown };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  return initialBlockState;
}

/**
 * Lift the block on the customer named by the hidden `customerId`, after the form's confirmation step.
 * Lifting a customer who is not blocked is an illegal transition and comes back as a German sentence.
 */
export async function unblockCustomerAction(
  _previous: BlockState,
  formData: FormData,
): Promise<BlockState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.block.errors.unknown };
  }

  try {
    await unblockCustomer(customerDeps, { customerId: customerId.data });
  } catch (error: unknown) {
    if (error instanceof IllegalStatusTransition) {
      return { status: "error", message: de.customers.block.errors.notBlocked };
    }
    return { status: "error", message: de.customers.block.errors.unknown };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  return initialBlockState;
}
