"use server";

/**
 * The block and unblock actions — adapters between the block forms and `blockCustomer` /
 * `unblockCustomer` (`tasks/prd-us-08-block-unblock-customer.md` §US-08.4).
 *
 * One level above `[id]/actions.ts` for `archive-actions.ts`'s reason: blocking is offered on two
 * screens (US-16.5), so one path blocks a customer and one place turns its refusals into German.
 * Every rule is the state machine's; the disabled save button is a courtesy, not the guard.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { blockCustomer } from "@/application/customers/block-customer";
import { unblockCustomer } from "@/application/customers/unblock-customer";
import { IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { blockSaved, type BlockState } from "./block-state";
import { tierOf } from "../notice-tier";
import { customerDeps } from "./deps";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Block the customer named by the hidden `customerId`, storing the reason from the textarea. An empty
 * reason is refused by `blockCustomer` even though the button is disabled until one is typed.
 */
export async function blockCustomerAction(
  _previous: BlockState,
  formData: FormData,
): Promise<BlockState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.block.errors.unknown, tier: "error" };
  }

  try {
    await blockCustomer(customerDeps, {
      customerId: customerId.data,
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error: unknown) {
    if (error instanceof MissingAuditReason) {
      return {
        status: "error",
        message: de.customers.block.errors.missingReason,
        tier: tierOf(error),
      };
    }
    if (error instanceof IllegalStatusTransition) {
      return {
        status: "error",
        message: de.customers.block.errors.notBlockable,
        tier: tierOf(error),
      };
    }
    return { status: "error", message: de.customers.block.errors.unknown, tier: tierOf(error) };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  return blockSaved;
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
    return { status: "error", message: de.customers.block.errors.unknown, tier: "error" };
  }

  try {
    await unblockCustomer(customerDeps, { customerId: customerId.data });
  } catch (error: unknown) {
    if (error instanceof IllegalStatusTransition) {
      return {
        status: "error",
        message: de.customers.block.errors.notBlocked,
        tier: tierOf(error),
      };
    }
    return { status: "error", message: de.customers.block.errors.unknown, tier: tierOf(error) };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  return blockSaved;
}
