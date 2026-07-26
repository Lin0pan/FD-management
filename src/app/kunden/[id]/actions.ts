"use server";

/**
 * The customer record's write actions — the thin adapters between the record's forms and the
 * `blockCustomer` / `unblockCustomer` (tasks/prd-us-08-block-unblock-customer.md §US-08.4) and
 * `reissueCard` (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3) use cases.
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
import { reissueCard } from "@/application/customers/reissue-card";
import { unblockCustomer } from "@/application/customers/unblock-customer";
import { CustomerArchived, IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";
import { initialBlockState, type BlockState } from "./block-state";
import { initialReissueState, type ReissueState } from "./reissue-state";

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
 * Issue a replacement for the card the customer named by the hidden `customerId` has lost.
 *
 * The reason is fixed here rather than taken off the form: this control is the loss control, and it
 * is what makes the loss count on the card view mean what it says. A reissue for changed household
 * counts is US-13's action and will carry its own reason.
 *
 * Nothing is checked before the call — the form's confirmation step is a courtesy to whoever clicked
 * it, and `reissueCard` is what decides whether the card may be issued. An archived customer is the
 * one refusal, and it comes back as a German sentence beside the button. On success both the record
 * and the card view are revalidated, so whichever screen the reissue was started from shows the new
 * number, and the other one does too when it is next opened.
 */
export async function reissueCardAction(
  _previous: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.reissue.errors.unknown };
  }

  try {
    await reissueCard(customerDeps, { customerId: customerId.data, reason: "LOST" });
  } catch (error: unknown) {
    if (error instanceof CustomerArchived) {
      return { status: "error", message: de.customers.reissue.errors.archived };
    }
    return { status: "error", message: de.customers.reissue.errors.unknown };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath(`/kunden/${customerId.data}/karte`);
  return initialReissueState;
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
