import { revalidatePath } from "next/cache";

/**
 * „Karten drucken" and both places counting it (US-39.6) — for every write that can add a row, take
 * one away, or change one: an issue, a tick, a number change, a block, an archiving.
 */
export function revalidateCardsToPrint(): void {
  revalidatePath("/karten-drucken");
  revalidatePath("/");
  revalidatePath("/uebersichten");
}
