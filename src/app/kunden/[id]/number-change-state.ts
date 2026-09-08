/**
 * The state the number control passes to and from its server action (US-30). Outside `actions.ts`
 * because a `"use server"` module may export nothing but async functions.
 *
 * A union of its own rather than the `RecordFormState` the five editors share: those report *that* a
 * save went through and let the revalidated record show the rest, where a move has to name three
 * figures — one of which, the slot just vacated, is nowhere on the revalidated page.
 */

import type { NumberChoice } from "@/application/customers/list-number-choices";
import type { NoticeTier } from "../../notice-tier";

export type NumberChangeState =
  | { readonly status: "idle" }
  | {
      readonly status: "saved";
      /**
       * The slot the household held before the move, carried rather than looked up afterwards: after
       * the write that row says the *new* number, so the receipt is the last place it is named.
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
       * (US-24's `freshPoolAfterRace`) — without it the control goes on offering a number that
       * provably cannot be saved.
       *
       * Absent on every other refusal, which is what lets the control tell "no fresh list" from "an
       * empty one".
       */
      readonly numberChoices?: ReadonlyArray<NumberChoice>;
    };

export const initialNumberChangeState: NumberChangeState = { status: "idle" };
