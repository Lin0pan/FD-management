"use server";

/**
 * The archive action — the adapter between the archive form and `archiveCustomer`
 * (`tasks/prd-us-10-archive-customer.md` §US-10.4).
 *
 * One level above `[id]/actions.ts` because archiving is offered on two screens, the record and the
 * counter (FR-2): one path by which a customer is archived, one place that turns its refusals into
 * German. Every rule is the state machine's.
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
 * The path the archive returns to. A closed pattern rather than a free string: the value arrives from
 * a form, and a redirect target a browser can choose is an open redirect however small the app is.
 */
const returnPath = z.string().regex(/^\/kunden\/\d+$|^\/ausgabe(\?nummer=[^&\s]*)?$/);

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Archive the customer named by the hidden `customerId`, storing the reason from the textarea. Both
 * screens are revalidated, whichever the archive was started from.
 *
 * **The navigation back is half the point**: the archive control is at the foot of a page whose
 * archived banner is at the head, and after the write that banner measured 356px *above* the
 * viewport.
 */
export async function archiveCustomerAction(
  _previous: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.archive.errors.unknown, tier: "error" };
  }
  // Where the control was pressed, constrained to the two screens that offer it: a `returnTo` a form
  // can put anything in is an open redirect.
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
