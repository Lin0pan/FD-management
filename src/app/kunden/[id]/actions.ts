"use server";

/**
 * The write actions that belong to the customer record **alone** — currently the reissue after a
 * loss (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3).
 *
 * The actions shared with the counter live one level up beside the components that use them:
 * `../block-actions.ts` and `../archive-actions.ts`. What is here is here because no other screen
 * offers it.
 *
 * Their only job is to read the fields off the form, call one use case, and translate a typed domain
 * error into a German sentence. Every rule lives in the domain and the use cases; a disabled save
 * button is a courtesy, never the guard. On success the affected screens are revalidated, so what
 * they show comes back from the store rather than from client memory.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reissueCard } from "@/application/customers/reissue-card";
import { CustomerArchived } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";
import { initialReissueState, type ReissueState } from "./reissue-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

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
