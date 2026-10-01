"use server";

/**
 * The two writes of „Karten drucken" (US-39.4): ticking a card off and, right after, taking the tick
 * back (D7). Both are named by the row DF saw — household and card index — so a card replaced in the
 * meantime is refused rather than its successor ticked off (D4).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { markCardPrinted } from "@/application/customers/mark-card-printed";
import { undoCardPrinted } from "@/application/customers/undo-card-printed";
import type { CardPrintInput } from "@/application/customers/mark-card-printed";
import {
  CardAlreadyPrinted,
  CardNotPrinted,
  CardSuperseded,
  CustomerArchived,
} from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../kunden/deps";
import { tierOf } from "../notice-tier";
import { PRINTED_CARD, PRINTED_CUSTOMER, type PrintState } from "./print-state";

/** A surrogate id or an index as a hidden field carries it — a positive whole number. */
const wholeNumber = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform((value): number => Number(value));

const cardInput = z.object({ customerId: wholeNumber, index: wholeNumber });

function readCard(formData: FormData): CardPrintInput | null {
  const parsed = cardInput.safeParse({
    customerId: String(formData.get("customerId") ?? ""),
    index: String(formData.get("index") ?? ""),
  });
  return parsed.success ? parsed.data : null;
}

function refusal(error: unknown): PrintState {
  const words = de.cardsToPrint.errors;
  const message =
    error instanceof CardSuperseded
      ? words.superseded
      : error instanceof CardAlreadyPrinted
        ? words.alreadyPrinted
        : error instanceof CardNotPrinted
          ? words.notPrinted
          : error instanceof CustomerArchived
            ? words.archived
            : words.unknown;
  return { status: "error", message, tier: tierOf(error) };
}

/** Everything that shows whether a card is printed — the list, its counts and the household. */
function revalidate(customerId: number): void {
  revalidatePath("/karten-drucken");
  revalidatePath("/");
  revalidatePath("/uebersichten");
  revalidatePath(`/kunden/${customerId}`);
  revalidatePath(`/kunden/${customerId}/karte`);
}

/** `redirect` throws its own control-flow error, so it is called outside the `try`. */
export async function markCardPrintedAction(
  _previous: PrintState,
  formData: FormData,
): Promise<PrintState> {
  const card = readCard(formData);
  if (card === null) {
    return { status: "error", message: de.cardsToPrint.errors.unknown, tier: "error" };
  }
  try {
    await markCardPrinted(customerDeps, card);
  } catch (error: unknown) {
    return refusal(error);
  }
  revalidate(card.customerId);
  redirect(`/karten-drucken?${PRINTED_CUSTOMER}=${card.customerId}&${PRINTED_CARD}=${card.index}`);
}

export async function undoCardPrintedAction(
  _previous: PrintState,
  formData: FormData,
): Promise<PrintState> {
  const card = readCard(formData);
  if (card === null) {
    return { status: "error", message: de.cardsToPrint.errors.unknown, tier: "error" };
  }
  try {
    await undoCardPrinted(customerDeps, card);
  } catch (error: unknown) {
    return refusal(error);
  }
  revalidate(card.customerId);
  redirect("/karten-drucken");
}
