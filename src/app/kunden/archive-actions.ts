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
import { redirect } from "next/navigation";
import { z } from "zod";
import { archiveCustomer } from "@/application/customers/archive-customer";
import { IllegalStatusTransition, MissingAuditReason } from "@/domain/errors";
import { de } from "@/i18n/de";
import { type ArchiveState } from "./archive-state";
import { ARCHIVED } from "./archived-flag";
import { tierOf } from "../notice-tier";
import { customerDeps } from "./deps";

/**
 * The path the archive returns to: the record, or the counter with the number that is looked up.
 *
 * A closed pattern rather than a free string. The value arrives from a form, and a redirect target a
 * browser can choose is an open redirect however small the application is.
 */
const returnPath = z.string().regex(/^\/kunden\/\d+$|^\/ausgabe(\?nummer=[^&\s]*)?$/);

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
 *
 * Then it navigates back to the screen it was pressed on, which the form names in `returnTo`, with
 * the flag that screen states the outcome by. The navigation is half the point: the archive control
 * is at the foot of a page whose archived banner is at the head of it, and after the write that
 * banner measured 356px *above* the viewport — the outcome was stated plainly and nobody was
 * looking at it.
 */
export async function archiveCustomerAction(
  _previous: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.archive.errors.unknown, tier: "error" };
  }
  // Where the control was pressed. Constrained to the two screens that offer it rather than trusted
  // as typed: a `returnTo` a form can put anything in is an open redirect, and this one comes back
  // out of a browser.
  const returnTo = returnPath.safeParse(String(formData.get("returnTo") ?? ""));

  try {
    await archiveCustomer(customerDeps, {
      customerId: customerId.data,
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error: unknown) {
    if (error instanceof MissingAuditReason) {
      return {
        status: "error",
        message: de.customers.archive.errors.missingReason,
        tier: tierOf(error),
      };
    }
    if (error instanceof IllegalStatusTransition) {
      return {
        status: "error",
        message: de.customers.archive.errors.notArchivable,
        tier: tierOf(error),
      };
    }
    return { status: "error", message: de.customers.archive.errors.unknown, tier: tierOf(error) };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath("/ausgabe");
  // `redirect` throws its own control-flow error, so it goes after the `try`: inside, the catch
  // would file the navigation as a failed archive.
  const back = returnTo.success ? returnTo.data : `/kunden/${customerId.data}`;
  redirect(`${back}${back.includes("?") ? "&" : "?"}${ARCHIVED}=1`);
}
