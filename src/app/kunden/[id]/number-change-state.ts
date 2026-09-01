/**
 * The state the number control passes to and from its server action (US-30).
 *
 * It lives outside `actions.ts` for the reason `reissue-state.ts` documents: a `"use server"` module
 * may export nothing but async functions, so a type or a constant there would be a build-time error.
 *
 * A union of its own rather than `RecordFormState`, which the record's five editors share, because
 * this control answers something they do not. Those five report *that* a save went through and let
 * the revalidated record show what it now says; a move has two numbers and a card number to name,
 * one of which — the slot the household has just left — is nowhere on the revalidated page.
 */

import type { NumberChoice } from "@/application/customers/list-number-choices";
import type { NoticeTier } from "../../notice-tier";

export type NumberChangeState =
  | { readonly status: "idle" }
  | {
      readonly status: "saved";
      /**
       * The slot the household held before the move, read from the register on the way in.
       *
       * It is carried rather than looked up afterwards because after the write the row it was read
       * from says the *new* number — the receipt is the last place the vacated slot is named, and a
       * staff member checking they freed the number they meant has nothing else to read it off.
       */
      readonly from: number;
      /** The slot they hold now, as the register stored it — not as the form asked for it. */
      readonly to: number;
      /** The card the move printed, e.g. `23k6`, formatted from the row the store wrote. */
      readonly cardNumber: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly tier: NoticeTier;
      /**
       * The numbers on offer as the register stands *now*, set only when the refusal was a lost race
       * for the chosen number (US-24's `freshPoolAfterRace`, one screen over). Without it the
       * control goes on offering a number that provably cannot be saved, and the staff member's
       * obvious next move — picking it again — fails identically.
       *
       * Absent on every other refusal, which is what lets the control tell "no fresh list" from "an
       * empty one". Re-reading the register is worth two queries when the list is what went stale
       * and is noise when the household was archived in another tab.
       */
      readonly numberChoices?: ReadonlyArray<NumberChoice>;
    };

export const initialNumberChangeState: NumberChangeState = { status: "idle" };
