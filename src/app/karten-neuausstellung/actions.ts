"use server";

/**
 * The cards-due screen's one write: replacing a card whose printed counts the household has outgrown
 * (`tasks/prd-us-13-age-13-reclassification.md` §US-13.4). The same act as the record's reissue,
 * through the same `reissueCard`.
 *
 * The reason is **fixed here** rather than read off the form: `STALE_COUNTS` is what this screen is,
 * and the loss count on the card view is only readable because each reissue says why it happened.
 *
 * Nothing is decided here. Every refusal this screen can get is a row that went stale under it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { reissueCard } from "@/application/customers/reissue-card";
import { formatCardNumber } from "@/domain/card/cardNumber";
import { CustomerArchived } from "@/domain/errors";
import { de } from "@/i18n/de";
import { tierOf } from "../notice-tier";
import { customerDeps } from "../kunden/deps";
import { customerErrorMessage } from "../kunden/neu/registration-input";
import { ISSUED_CARD } from "./issued-card";
import { type StaleReissueState } from "./reissue-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Issue a new card for the household named by the hidden `customerId`, recording `STALE_COUNTS`.
 *
 * It **redirects** rather than returning a `saved` state, because the revalidate removes the very row
 * this was submitted from — the control and any state it held go with it. The new number rides in the
 * URL and the page states it above the list. `redirect` throws its own control-flow error, so it is
 * called outside the `try`.
 */
export async function reissueStaleCardAction(
  _previous: StaleReissueState,
  formData: FormData,
): Promise<StaleReissueState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.reissue.errors.unknown, tier: "error" };
  }

  let cardNumber: string;
  try {
    const card = await reissueCard(customerDeps, {
      customerId: customerId.data,
      reason: "STALE_COUNTS",
    });
    // Both halves off the card the store handed back: the slot it was printed under is on the row
    // itself (ADR-016), so nothing has to read the household again.
    cardNumber = formatCardNumber(card.customerNumber, card.index);
  } catch (error: unknown) {
    if (error instanceof CustomerArchived) {
      return {
        status: "error",
        message: de.customers.reissue.errors.archived,
        tier: tierOf(error),
      };
    }
    // The two lost card races speak `customerErrorMessage`'s sentences, so one race cannot be
    // reported three ways on the three screens that can lose it. The last word stays this screen's.
    return {
      status: "error",
      message: customerErrorMessage(error) ?? de.customers.reissue.errors.unknown,
      tier: tierOf(error),
    };
  }

  revalidatePath("/karten-neuausstellung");
  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath(`/kunden/${customerId.data}/karte`);
  // The hub, which counts this list in a badge of its own (US-17.2).
  revalidatePath("/kunden");
  redirect(`/karten-neuausstellung?${ISSUED_CARD}=${encodeURIComponent(cardNumber)}`);
}
