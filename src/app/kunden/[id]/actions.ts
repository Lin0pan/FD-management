"use server";

/**
 * The customer record's block and unblock actions — the thin adapters between the record's forms and
 * the `blockCustomer` / `unblockCustomer` use cases (tasks/prd-us-08-block-unblock-customer.md
 * §US-08.4).
 *
 * Their only jobs are to read the customer id (and, for a block, the reason) off the form, call one
 * use case, and translate a typed domain error into a German sentence. Every rule — that a block
 * needs a non-empty reason, and that only an active customer can be blocked or a blocked one lifted —
 * lives in the domain and the use cases; the disabled save button is a courtesy, the state machine is
 * the guard. On success the record is revalidated so its status, reason and controls come back from
 * the store rather than from client memory.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { blockCustomer } from "@/application/customers/block-customer";
import { unblockCustomer } from "@/application/customers/unblock-customer";
import { IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";
import { initialBlockState, type BlockState } from "./block-state";

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
  return initialBlockState;
}
