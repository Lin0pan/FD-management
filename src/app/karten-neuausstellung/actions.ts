"use server";

/**
 * The cards-due screen's one write: replacing a card whose printed counts the household has outgrown
 * (tasks/prd-us-13-age-13-reclassification.md §US-13.4).
 *
 * It is the same act as the reissue on the customer record, and it goes through the same use case —
 * `reissueCard`, and therefore `issueCard`, the one path by which a card comes into existence. What
 * differs is the reason, and like the loss control this one *fixes* it rather than reading it off the
 * form: `STALE_COUNTS` is what this screen is, and a reason arriving from the browser would let a
 * reissue file itself under the wrong one. That distinction is not cosmetic — the loss count on the
 * card view is only readable because each reissue says why it happened.
 *
 * Nothing is decided here. Whether the customer may be issued a card is `reissueCard`'s judgement,
 * and every refusal it can give this screen is a row that went stale under it: an archived
 * household, one of the two lost card races, or a record that has left the register altogether.
 * Each reaches it only via a list rendered before somebody else changed what it was describing.
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
 * On success four screens are revalidated: this list (the row is gone, because the new card prints
 * today's counts), the household's record and card view (they name the new number), and the home
 * screen (its badge counts this list).
 *
 * Then it **redirects**, rather than returning a `saved` state, because the row this was submitted
 * from is exactly what the revalidate removes — the control and any state it held go with it, which
 * is why this write had no confirmation at all. The
 * new number rides in the URL and the page states it above the list, the same way the registration
 * hands its confirmation to the record it lands on. `redirect` throws its own control-flow error, so
 * it is called outside the `try` — inside, the catch would file the navigation as a failed reissue.
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
    // Both halves off the card the store handed back, as on the record's own control: the slot it
    // was printed under is on the row itself (US-30), so nothing has to read the household again to
    // ask it a number the card already carries.
    cardNumber = formatCardNumber(card.customerNumber, card.index);
  } catch (error: unknown) {
    if (error instanceof CustomerArchived) {
      return {
        status: "error",
        message: de.customers.reissue.errors.archived,
        tier: tierOf(error),
      };
    }
    // The two lost card races say what happened, in the sentences the registration and the record
    // read them with — `customerErrorMessage` is where they live, so one race cannot come to be
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
  // The hub, which counts this list in a badge of its own (US-17.2). Not the home screen any more:
  // it counted nothing once US-18.3 moved the signals onto the hub, and `src/app/page.tsx` now
  // renders the week colour and nothing else.
  revalidatePath("/kunden");
  redirect(`/karten-neuausstellung?${ISSUED_CARD}=${encodeURIComponent(cardNumber)}`);
}
